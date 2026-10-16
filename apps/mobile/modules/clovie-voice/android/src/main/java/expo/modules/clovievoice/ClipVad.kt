package expo.modules.clovievoice

/** What the clip recorder should do after a frame. */
enum class ClipDecision { CONTINUE, END_OF_SPEECH, NO_SPEECH, MAX_LENGTH }

/**
 * Energy voice-activity detection for one spoken command. Pure: frames in, decision out, so it is
 * unit tested without a microphone.
 *
 * The noise floor is the quietest frame of the first [CALIBRATION_MS] (robust when the owner starts
 * talking at once), then it keeps following quiet frames down. A frame is loud when it is above
 * max(floor x 2.5, [MIN_THRESHOLD]): low enough for normal and soft speech (a phone at arm's length
 * peaks around 0.09 RMS, with syllable valleys near 0.01). Speech counts once [CONFIRM_MS] of loud
 * frames has accumulated (a click is not speech); after that, the [HANGOVER_MS] following each loud
 * frame still counts as speech, so gaps between syllables and words are not silence.
 *
 * The clip ends after [endSilenceMs] of continuous below-threshold audio, but never sooner than
 * [minAfterSpeechMs] after speech started; after [MAX_MS] in all; or with no speech at all after
 * [noSpeechMs].
 */
class ClipVad(
  private val endSilenceMs: Long = END_SILENCE_MS,
  private val minAfterSpeechMs: Long = MIN_AFTER_SPEECH_MS,
  private val noSpeechMs: Long = NO_SPEECH_MS,
  private val maxMs: Long = MAX_MS,
) {
  var elapsedMs = 0L
    private set

  /** Time counted as speech: loud frames plus their hangover. */
  var speechMs = 0L
    private set
  var peakRms = 0f
    private set
  var floor = 0f
    private set
  val hasSpeech: Boolean
    get() = loudMs >= CONFIRM_MS

  private var loudMs = 0L
  private var calibratedMs = 0L
  private var minCalibrationRms = Float.MAX_VALUE
  private var silenceMs = 0L
  private var sinceLoudMs = Long.MAX_VALUE / 2
  private var speechStartedMs = -1L

  val threshold: Float
    get() = maxOf(floor * THRESHOLD_FACTOR, MIN_THRESHOLD)

  fun update(rms: Float, frameMs: Long): ClipDecision {
    elapsedMs += frameMs
    peakRms = maxOf(peakRms, rms)
    if (calibratedMs < CALIBRATION_MS) {
      calibratedMs += frameMs
      minCalibrationRms = minOf(minCalibrationRms, rms)
      floor = minCalibrationRms.coerceAtLeast(MIN_FLOOR).coerceAtMost(MAX_FLOOR)
    } else if (rms > threshold) {
      if (speechStartedMs < 0) speechStartedMs = elapsedMs - frameMs
      loudMs += frameMs
      speechMs += frameMs
      silenceMs = 0
      sinceLoudMs = 0
    } else {
      silenceMs += frameMs
      sinceLoudMs += frameMs
      if (loudMs > 0 && sinceLoudMs <= HANGOVER_MS) speechMs += frameMs
      else if (rms < floor) floor = rms.coerceAtLeast(MIN_FLOOR)
    }
    val spokeLongEnough = speechStartedMs >= 0 && elapsedMs - speechStartedMs >= minAfterSpeechMs
    return when {
      hasSpeech && silenceMs >= endSilenceMs && spokeLongEnough -> ClipDecision.END_OF_SPEECH
      elapsedMs >= maxMs -> if (hasSpeech) ClipDecision.MAX_LENGTH else ClipDecision.NO_SPEECH
      !hasSpeech && elapsedMs >= noSpeechMs -> ClipDecision.NO_SPEECH
      else -> ClipDecision.CONTINUE
    }
  }

  companion object {
    const val CALIBRATION_MS = 200L
    const val CONFIRM_MS = 120L
    const val HANGOVER_MS = 300L
    const val END_SILENCE_MS = 1_200L
    const val MIN_AFTER_SPEECH_MS = 1_500L
    const val NO_SPEECH_MS = 4_000L
    const val MAX_MS = 10_000L
    const val MIN_FLOOR = 0.0005f
    const val MAX_FLOOR = 0.03f
    const val THRESHOLD_FACTOR = 2.5f
    const val MIN_THRESHOLD = 0.006f

    /** RMS (0..1 of full scale) of the first `count` samples. */
    fun rms(samples: ShortArray, count: Int): Float {
      if (count <= 0) return 0f
      var sum = 0.0
      for (i in 0 until count) {
        val s = samples[i] / 32768.0
        sum += s * s
      }
      return kotlin.math.sqrt(sum / count).toFloat()
    }

    /** A 0..1 meter value for the overlay glow: speech sits around 0.02..0.2 RMS, so scale it up. */
    fun meter(rms: Float): Float = (rms * 6f).coerceIn(0f, 1f)
  }
}
