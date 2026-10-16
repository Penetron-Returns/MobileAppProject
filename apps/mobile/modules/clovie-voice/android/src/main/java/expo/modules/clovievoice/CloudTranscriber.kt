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
  data class Text(val text: String) : CloudResult

  /** `status` is the HTTP status, or 0 when the server was never reached; `code` is our API error code. */
  data class Failure(val status: Int, val code: String) : CloudResult {
    /** For logs: reason only, never the token, audio or text. */
    fun describe(): String = "status=$status code=$code"
  }
}

/**
 * Uploads a captured WAV straight to the backend with the device voice token, so voice works with no
 * JS runtime. No `language` field is sent: the server auto-detects (English or Afrikaans). Blocking:
 * call it off the main thread.
 */
object CloudTranscriber {
  private const val CONNECT_TIMEOUT_MS = 5_000
  private const val READ_TIMEOUT_MS = 20_000
  private const val MAX_RESPONSE_BYTES = 64 * 1024

  fun transcribe(credentials: VoiceCredentials, wav: File): CloudResult {
    val boundary = "clovie" + UUID.randomUUID().toString().replace("-", "")
    var connection: HttpURLConnection? = null
    return try {
      val body = multipartBody(boundary, wav.name, wav.readBytes())
      connection = (URL(credentials.apiUrl + "/v1/voice/transcriptions").openConnection() as HttpURLConnection).apply {
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
      if (status in 200..299) parseText(text) ?: CloudResult.Failure(status, "BAD_RESPONSE")
      else CloudResult.Failure(status, errorCode(text))
    } catch (_: IOException) {
      CloudResult.Failure(0, "NETWORK_ERROR")
    } catch (_: RuntimeException) {
      CloudResult.Failure(0, "CLIENT_ERROR")
    } finally {
      connection?.disconnect()
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
  fun multipartBody(boundary: String, filename: String, wav: ByteArray): ByteArray {
    val out = ByteArrayOutputStream(wav.size + 256)
    out.write(
      ("--$boundary\r\n" +
        "Content-Disposition: form-data; name=\"audio\"; filename=\"$filename\"\r\n" +
        "Content-Type: audio/wav\r\n\r\n").toByteArray(Charsets.UTF_8),
    )
    out.write(wav)
    out.write("\r\n--$boundary--\r\n".toByteArray(Charsets.UTF_8))
    return out.toByteArray()
  }

  /** The API's `{ "error": { "code": "UNAUTHENTICATED", ... } }` code, or UNKNOWN. */
  fun errorCode(body: String?): String =
    body?.let { Regex("\"code\"\\s*:\\s*\"([A-Z0-9_]{2,40})\"").find(it)?.groupValues?.get(1) } ?: "UNKNOWN"

  private fun parseText(body: String?): CloudResult.Text? = try {
    body?.let { CloudResult.Text(JSONObject(it).getJSONObject("data").optString("text", "")) }
  } catch (_: org.json.JSONException) {
    null
  }
}
