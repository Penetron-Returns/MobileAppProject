package expo.modules.clovievoice

/**
 * Our API's `Server-Timing` on a transcription response: `nerova;dur=…, proxy;dur=…` (ms). Either may be absent.
 * Timings only, so it is safe to log.
 */
data class ServerTiming(val proxyMs: Long?, val nerovaMs: Long?, val authMs: Long? = null) {
  companion object {
    val NONE = ServerTiming(null, null)

    fun parse(header: String?): ServerTiming {
      if (header.isNullOrBlank()) return NONE
      val durations = header.split(',').mapNotNull { entry ->
        val parts = entry.trim().split(';').map { it.trim() }
        val name = parts.firstOrNull()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val dur = parts.drop(1).firstNotNullOfOrNull { Regex("""^dur=([0-9]+(?:\.[0-9]+)?)$""").find(it)?.groupValues?.get(1) }
        dur?.toDoubleOrNull()?.let { name to Math.round(it) }
      }.toMap()
      return ServerTiming(durations["proxy"], durations["nerova"], durations["auth"])
    }
  }
}
