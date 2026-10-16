package expo.modules.clovievoice

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/** One short sound per voice state, so an owner who cannot read the overlay still knows where Clovie is. */
enum class Cue {
  /** Clovie woke up and is listening. Bright and rising. */
  WAKE,

  /** Listening ended, the words are being understood. A quiet "got it". */
  PROCESSING,

  /** The very soft heartbeat while a slow answer is awaited. */
  PULSE,

  /** It worked. Warm and resolving. */
  SUCCESS,

  /** Didn't catch that, or nothing to do. Soft, lower and falling, clearly not success. */
  FAILURE,
}

/** One sine note of a cue (with a quiet second harmonic). */
data class Tone(
  val frequencyHz: Double,
  val startMs: Int,
  val lengthMs: Int,
  /** Peak level in 0..1 of full scale. Kept low: these are soft cues, never alerts. */
  val gain: Double,
  /** Exponential decay rate per second; higher is shorter and drier. */
  val decay: Double,
  /** Level of the octave overtone relative to the note. */
  val overtone: Double = 0.0,
)

/** What each cue is made of. Frequencies are equal-tempered notes. */
object CueScores {
  private const val E5 = 659.25
  private const val G5 = 783.99
  private const val A5 = 880.0
  private const val C5 = 523.25
  private const val D5 = 587.33
  private const val E6 = 1318.51
  private const val G4 = 392.0
  private const val D4 = 293.66

  const val WAKE_MS = 300
  const val PROCESSING_MS = 260
  const val PULSE_MS = 180
  const val SUCCESS_MS = 560
  const val FAILURE_MS = 460

  fun notes(cue: Cue): List<Tone> = when (cue) {
    // A5 up to E6, a bright open fifth: higher than the old E5/A5 chime, same 300 ms entrance timing.
    Cue.WAKE -> listOf(
      Tone(A5, 0, 190, 0.20, 13.0, overtone = 0.16),
      Tone(E6, 110, 190, 0.22, 13.0, overtone = 0.12),
    )
    // D5 to G5, a rising fourth at about half the level of the wake chime.
    Cue.PROCESSING -> listOf(
      Tone(D5, 0, 150, 0.11, 16.0),
      Tone(G5, 85, 175, 0.13, 15.0),
    )
    Cue.PULSE -> listOf(Tone(D5, 0, PULSE_MS, 0.06, 14.0))
    // C5, E5, G5: a rising major triad that settles, with a longer, warmer tail.
    Cue.SUCCESS -> listOf(
      Tone(C5, 0, 260, 0.17, 8.5, overtone = 0.10),
      Tone(E5, 95, 260, 0.17, 8.0, overtone = 0.10),
      Tone(G5, 190, 370, 0.19, 7.0, overtone = 0.12),
    )
    // G4 down to D4: a soft falling fifth, pure sine, no sparkle.
    Cue.FAILURE -> listOf(
      Tone(G4, 0, 230, 0.20, 9.0),
      Tone(D4, 150, 310, 0.20, 7.5),
    )
  }

  fun durationMs(cue: Cue): Int = when (cue) {
    Cue.WAKE -> WAKE_MS
    Cue.PROCESSING -> PROCESSING_MS
    Cue.PULSE -> PULSE_MS
    Cue.SUCCESS -> SUCCESS_MS
    Cue.FAILURE -> FAILURE_MS
  }
}

/** Renders a cue to 16-bit mono PCM. Pure maths: no Android types, so it runs in JVM tests. */
object CueSynth {
  const val SAMPLE_RATE = 44_100
  private const val ATTACK_S = 0.008
  private const val RELEASE_S = 0.012

  fun synthesize(cue: Cue, sampleRate: Int = SAMPLE_RATE): ShortArray {
    val total = sampleRate * CueScores.durationMs(cue) / 1000
    val out = FloatArray(total)
    for (tone in CueScores.notes(cue)) render(tone, sampleRate, out)
    return ShortArray(total) { (out[it].coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort() }
  }

  private fun render(tone: Tone, sampleRate: Int, out: FloatArray) {
    val start = sampleRate * tone.startMs / 1000
    val length = sampleRate * tone.lengthMs / 1000
    val lengthS = tone.lengthMs / 1000.0
    for (i in 0 until length) {
      val at = start + i
      if (at >= out.size) break
      val t = i / sampleRate.toDouble()
      val attack = (t / ATTACK_S).coerceAtMost(1.0)
      // A short fade at the end of the note so it never clicks, however slowly it decays.
      val release = ((lengthS - t) / RELEASE_S).coerceIn(0.0, 1.0)
      val envelope = attack * release * exp(-t * tone.decay)
      val wave = sin(2 * PI * tone.frequencyHz * t) + tone.overtone * sin(4 * PI * tone.frequencyHz * t)
      out[at] += (wave * envelope * tone.gain).toFloat()
    }
  }
}

/** When and which cue plays. */
object CuePolicy {
  // AudioManager.RINGER_MODE_SILENT and NotificationManager.INTERRUPTION_FILTER_NONE, kept as plain
  // numbers so this stays a pure JVM unit.
  const val RINGER_SILENT = 0
  const val FILTER_NONE = 3

  /** Wait this long in "processing" before the first soft pulse, then pulse at the interval. */
  const val PULSE_AFTER_MS = 1_500L
  const val PULSE_EVERY_MS = 1_600L

  /**
   * Silent only in total silence: ringer on silent, or Do Not Disturb set to "total silence". Normal and
   * vibrate both play: this is a voice interaction the owner started, not a notification.
   */
  fun isAudible(ringerMode: Int, interruptionFilter: Int): Boolean =
    ringerMode != RINGER_SILENT && interruptionFilter != FILTER_NONE

  /** The cue for an overlay state, or null when that state makes no sound of its own ("listening" has the wake chime). */
  fun cueFor(overlayState: String): Cue? = when (overlayState) {
    "listening" -> Cue.WAKE
    "processing", "request" -> Cue.PROCESSING
    "done" -> Cue.SUCCESS
    "error" -> Cue.FAILURE
    else -> null
  }
}
