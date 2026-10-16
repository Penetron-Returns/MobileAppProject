package expo.modules.clovievoice

/** What the uploaded clip is, derived from its file name so the capture and the upload cannot disagree. */
data class ClipFormat(val contentType: String, val extension: String)

/** Pure parts of the clip encoding: formats, AAC parameters and the PCM chunking the encoder loop uses. */
object AudioFormats {
  val WAV = ClipFormat("audio/wav", "wav")
  val M4A = ClipFormat("audio/mp4", "m4a")

  const val SAMPLE_RATE = 16_000

  /** AAC-LC mono at 32 kbps is about 4 KB per second of speech: a 4 s clip is ~16 KB instead of 125 KB. */
  const val AAC_BIT_RATE = 32_000
  const val AAC_MIME = "audio/mp4a-latm"
  private const val BYTES_PER_SAMPLE = 2

  /** The format named by a file's extension; anything unknown is treated as WAV (the capture's fallback). */
  fun forFileName(name: String): ClipFormat =
    if (name.substringAfterLast('.', "").lowercase() == M4A.extension) M4A else WAV

  /** Presentation time of the next PCM sample, in microseconds. */
  fun ptsUs(samplesFed: Long, sampleRate: Int = SAMPLE_RATE): Long = samplesFed * 1_000_000L / sampleRate

  /** How many samples fit the next encoder input buffer (whole samples only, never more than remain). */
  fun chunkSamples(remaining: Int, bufferCapacityBytes: Int): Int =
    maxOf(0, minOf(remaining, bufferCapacityBytes / BYTES_PER_SAMPLE))

  /** Rough size of an encoded clip, for logs and sanity checks. */
  fun estimatedAacBytes(durationMs: Long, bitRate: Int = AAC_BIT_RATE): Long = durationMs * bitRate / 8_000L
}
