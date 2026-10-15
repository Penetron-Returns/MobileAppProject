package expo.modules.clovievoice

import kotlin.math.sqrt

/**
 * A cheap voice-activity gate in front of the wake-word models: speech is likely when a chunk's level
 * clears an adaptive noise floor, and stays "likely" for a hangover long enough for the whole phrase
 * to sit in the 2 s window. While nothing is being said the models do not run at all. The ring buffer
 * keeps filling, so the start of "Hey..." is already there (2 s of pre-roll) when the gate opens.
 *
 * A plain energy gate, not a neural VAD: it opens on any loud sound (a door, a hair dryer), which only
 * costs a few model runs, and it does not gate out speech at normal distance. Silero VAD would cut
 * the false opens; see docs/voice.md.
 */
class SpeechGate(private val hangoverMs: Long = HANGOVER_MS) {
  private var floor = 0.004f
  private var lastSpeechAt = Long.MIN_VALUE / 2

  /** Feeds one chunk (16 kHz PCM16); true while the models should run. */
  fun update(chunk: ShortArray, count: Int, nowMs: Long): Boolean {
    if (count <= 0) return isActive(nowMs)
    var sum = 0.0
    for (i in 0 until count) {
      val s = chunk[i] / 32768.0
      sum += s * s
    }
    val rms = sqrt(sum / count).toFloat()
    // The floor follows quiet quickly and loud slowly, so speech does not become the new "silence".
    floor = if (rms < floor) rms.coerceAtLeast(MIN_FLOOR) else (floor + (rms - floor) * 0.002f).coerceAtMost(MAX_FLOOR)
    if (rms > maxOf(floor * 3f, MIN_SPEECH_RMS)) lastSpeechAt = nowMs
    return isActive(nowMs)
  }

  fun isActive(nowMs: Long): Boolean = nowMs - lastSpeechAt < hangoverMs

  private companion object {
    const val HANGOVER_MS = 2_200L
    const val MIN_FLOOR = 0.0005f
    const val MAX_FLOOR = 0.05f
    const val MIN_SPEECH_RMS = 0.012f // about -38 dBFS
  }
}
