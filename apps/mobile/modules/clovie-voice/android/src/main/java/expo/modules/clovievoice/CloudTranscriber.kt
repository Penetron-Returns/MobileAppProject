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
  private const val CONNECT_TIMEOUT_MS = 5_000
  private const val READ_TIMEOUT_MS = 20_000
  private const val MAX_RESPONSE_BYTES = 64 * 1024

  /** `GET /v1/voice/ping`: a cheap authenticated call whose only job is to leave a warm pooled connection. Returns its ms. */
  fun warm(credentials: VoiceCredentials): Long {
    val started = System.nanoTime()
    try {
      val connection = (URL(credentials.apiUrl + "/v1/voice/ping").openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = READ_TIMEOUT_MS
        setRequestProperty("Authorization", "Bearer " + credentials.token)
        setRequestProperty("Accept", "application/json")
      }
      drain(connection)
    } catch (_: IOException) {
      // Best effort: the upload will open its own connection.
    } catch (_: RuntimeException) {
      // Same.
    }
    return (System.nanoTime() - started) / 1_000_000L
  }

  /** Reads the response to its end and closes the stream, which returns the socket to the pool. */
  private fun drain(connection: HttpURLConnection) {
    val status = connection.responseCode
    (if (status in 200..299) connection.inputStream else connection.errorStream)?.use { readLimited(it) }
  }

  fun transcribe(credentials: VoiceCredentials, clip: File): CloudResult {
    val boundary = "clovie" + UUID.randomUUID().toString().replace("-", "")
    return try {
      val format = AudioFormats.forFileName(clip.name)
      val body = multipartBody(boundary, clip.name, clip.readBytes(), format.contentType)
      VoiceTimings.uploadStarted(body.size.toLong())
      val connection = (URL(credentials.apiUrl + "/v1/voice/transcriptions").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = CONNECT_TIMEOUT_MS
        readTimeout = READ_TIMEOUT_MS
        doOutput = true
        setFixedLengthStreamingMode(body.size)
        setRequestProperty("Authorization", "Bearer " + credentials.token)
        setRequestProperty("Idempotency-Key", UUID.randomUUID().toString())
        setRequestProperty("Accept", "application/json")
        setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
      }
      connection.outputStream.use { it.write(body) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val text = stream?.use { readLimited(it) }
      if (status in 200..299) {
        parseText(text, ServerTiming.parse(connection.getHeaderField("Server-Timing"))) ?: CloudResult.Failure(status, "BAD_RESPONSE")
      } else {
        CloudResult.Failure(status, errorCode(text))
      }
    } catch (_: IOException) {
      CloudResult.Failure(0, "NETWORK_ERROR")
    } catch (_: RuntimeException) {
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
