package expo.modules.clovievoice

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import org.json.JSONObject

/** What uploading one clip to `POST /v1/voice/transcriptions` came to. */
sealed interface CloudResult {
  data class Text(val text: String, val timing: ServerTiming = ServerTiming.NONE) : CloudResult

  /** `status` is the HTTP status, or 0 when the server was never reached; `code` is our API error code. */
  data class Failure(val status: Int, val code: String) : CloudResult {
    /** For logs: reason only, never the token, audio or text. */
    fun describe(): String = "status=$status code=$code"
  }
}

/** Pure decisions for the upload: when a kept-alive connection is suspect, and when to retry. */
object UploadPolicy {
  const val UNSET = -1L

  /** The gateway drops idle connections after roughly 15 to 30 s; past this the socket may already be dead. */
  const val IDLE_MS = 10_000L
  const val MAX_ATTEMPTS = 2

  /** True when the last good response is older than [IDLE_MS]. Never true before the first request (nothing pooled). */
  fun isStale(lastSuccessAtMs: Long, nowMs: Long): Boolean = lastSuccessAtMs != UNSET && nowMs - lastSuccessAtMs >= IDLE_MS

  /** Retry only when the server was never reached (a network error or timeout) and an attempt is left. */
  fun shouldRetry(attemptsMade: Int, result: CloudResult): Boolean =
    attemptsMade < MAX_ATTEMPTS && result is CloudResult.Failure && result.code == "NETWORK_ERROR"
}

/**
 * Uploads a captured clip (m4a, or WAV as a fallback) straight to the backend with the device voice token,
 * so voice works with no JS runtime. No `language` field is sent: the server auto-detects (English or
 * Afrikaans). Blocking: call it off the main thread.
 *
 * Connections are kept alive: `HttpURLConnection` pools sockets per host, but only while a connection is
 * never `disconnect()`ed, so every response is read to its end and its stream closed instead. [warm] opens the
 * connection (DNS, TLS, and the Edge Function) when the wake word fires, before the clip has ended.
 */
object CloudTranscriber {
  private const val CONNECT_TIMEOUT_MS = 4_000
  private const val READ_TIMEOUT_MS = 12_000

  /** A probe of a possibly dead pooled socket: a healthy one answers in well under a second. */
  private const val PROBE_READ_TIMEOUT_MS = 3_000
  private const val MAX_RESPONSE_BYTES = 64 * 1024

  /** Elapsed-realtime ms of the last request that got a response; [UploadPolicy.UNSET] before any. */
  @Volatile private var lastSuccessAtMs = UploadPolicy.UNSET

  init {
    // Best effort (read once, when the platform's HTTP stack starts): drop pooled sockets before the gateway does.
    if (System.getProperty("http.keepAliveDuration") == null) System.setProperty("http.keepAliveDuration", "8000")
  }

  private fun nowMs() = android.os.SystemClock.elapsedRealtime()

  /** `GET /v1/voice/ping`: a cheap authenticated call whose only job is to leave a warm pooled connection. Returns its ms. */
  fun warm(credentials: VoiceCredentials, readTimeoutMs: Int = READ_TIMEOUT_MS): Long {
    val started = System.nanoTime()
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(credentials.apiUrl + "/v1/voice/ping").openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = readTimeoutMs
        setRequestProperty("Authorization", "Bearer " + credentials.token)
        setRequestProperty("Accept", "application/json")
      }
      drain(connection)
      lastSuccessAtMs = nowMs()
    } catch (_: IOException) {
      // Best effort: a dead socket is evicted so the upload opens a fresh one.
      connection?.disconnect()
    } catch (_: RuntimeException) {
      connection?.disconnect()
    }
    return (System.nanoTime() - started) / 1_000_000L
  }

  /** Reads the response to its end and closes the stream, which returns the socket to the pool. */
  private fun drain(connection: HttpURLConnection) {
    val status = connection.responseCode
    (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { readLimited(it) }
  }

  /**
   * Uploads `clip`. A connection idle past [UploadPolicy.IDLE_MS] is probed first (a dead one is evicted), and a
   * network failure is retried once on a fresh connection with the same clip and the same `Idempotency-Key`.
   */
  fun transcribe(credentials: VoiceCredentials, clip: File): CloudResult {
    val boundary = "clovie" + UUID.randomUUID().toString().replace("-", "")
    val idempotencyKey = UUID.randomUUID().toString()
    val body = try {
      multipartBody(boundary, clip.name, clip.readBytes(), AudioFormats.forFileName(clip.name).contentType)
    } catch (_: IOException) {
      return CloudResult.Failure(0, "CLIENT_ERROR")
    }
    VoiceTimings.uploadStarted(body.size.toLong())
    if (UploadPolicy.isStale(lastSuccessAtMs, nowMs())) warm(credentials, PROBE_READ_TIMEOUT_MS)
    var attempts = 0
    var result: CloudResult
    do {
      attempts += 1
      result = uploadOnce(credentials, body, boundary, idempotencyKey)
    } while (UploadPolicy.shouldRetry(attempts, result))
    VoiceTimings.external("uploadAttempts", attempts.toLong())
    return result
  }

  private fun uploadOnce(credentials: VoiceCredentials, body: ByteArray, boundary: String, idempotencyKey: String): CloudResult {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(credentials.apiUrl + "/v1/voice/transcriptions").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = READ_TIMEOUT_MS
        doOutput = true
        setFixedLengthStreamingMode(body.size)
        setRequestProperty("Authorization", "Bearer " + credentials.token)
        setRequestProperty("Idempotency-Key", idempotencyKey)
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      }
      connection.outputStream.use { it.write(body) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.use { readLimited(it) }
      lastSuccessAtMs = nowMs()
      if (status in 200..299) {
        parseText(text, ServerTiming.parse(connection.getHeaderField("Server-Timing"))) ?: CloudResult.Failure(status, "BAD_RESPONSE")
      } else {
        CloudResult.Failure(status, errorCode(text))
      }
    } catch (_: IOException) {
      connection?.disconnect() // evicts the broken socket so the retry cannot reuse it
      CloudResult.Failure(0, "NETWORK_ERROR")
    } catch (_: RuntimeException) {
      connection?.disconnect()
      CloudResult.Failure(0, "CLIENT_ERROR")
    }
  }

  private fun readLimited(stream: java.io.InputStream): String {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(4096)
    while (out.size() < MAX_RESPONSE_BYTES) {
      val n = stream.read(buffer)
      if (n < 0) break
      out.write(buffer, 0, n)
    }
    return out.toString("UTF-8")
  }

  /** One `audio` part and nothing else (no `language`). */
  fun multipartBody(boundary: String, filename: String, audio: ByteArray, contentType: String = AudioFormats.WAV.contentType): ByteArray {
    val out = ByteArrayOutputStream(audio.size + 256)
    out.write(
      ("--$boundary\r\n" +
        "Content-Disposition: form-data; name=\"audio\"; filename=\"$filename\"\r\n" +
        "Content-Type: $contentType\r\n\r\n").toByteArray(Charsets.UTF_8),
    )
    out.write(audio)
    out.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
    return out.toByteArray()
  }

  /** The API's `{ "error": { "code": "UNAUTHENTICATED", ... } }` code, or UNKNOWN. */
  fun errorCode(body: String?): String =
    body?.let { Regex("\"code\"\\s*:\\s*\"([A-Z0-9_]{2,40})\"").find(it)?.groupValues?.get(1) } ?: "UNKNOWN"

  private fun parseText(body: String?, timing: ServerTiming): CloudResult.Text? = try {
    body?.let { CloudResult.Text(JSONObject(it).getJSONObject("data").optString("text", ""), timing) }
  } catch (_: org.json.JSONException) {
    null
  }
}
