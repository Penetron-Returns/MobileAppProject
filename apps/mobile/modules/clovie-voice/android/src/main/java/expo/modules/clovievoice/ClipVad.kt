package expo.modules.clovievoice

/** What the clip recorder should do after a frame. */
enum class ClipDecision { CONTINUE, END_OF_SPEECH, NO_SPEECH, MAX_LENGTH }

/**
 * Energy voice-activity detection for one spoken command. Pure: frames in, decision out, so it is
 * unit tested without a microphone.
 *
 * The noise floor is the quietest frame of the first [CALIBRATION_MS] (robust when the owner starts
 * talking at once), then it keeps following quiet frames down. Speech is a frame above
 * max(floor x 3, floor + 0.012); it counts once [CONFIRM_MS] of it has accumulated (a click is not
 * speech). The clip ends [END_SILENCE_MS] after the last speech frame, after [MAX_MS] in all, or with
 * no speech at all after [NO_SPEECH_MS].
 */
class ClipVad(
  private val endSilenceMs: Long = END_SILENCE_MS,
  private val noSpeechMs: Long = NO_SPEECH_MS,
  private val maxMs: Long = MAX_MS,
) {
  var elapsedMs = 0L
    private set
  var speechMs = 0L
    private set
  var peakRms = 0f
    private set
  var floor = 0f
    private set
  val hasSpeech: Boolean
    get() = speechMs >= CONFIRM_MS

  private var calibratedMs = 0L
  private var minCalibrationRms = Float.MAX_VALUE
  private var silenceMs = 0L

  val threshold: Float
    get() = maxOf(floor * 3f, floor + MIN_MARGIN)

  fun update(rms: Float, frameMs: Long): ClipDecision {
    elapsedMs += frameMs
    peakRms = maxOf(peakRms, rms)
    if (calibratedMs < CALIBRATION_MS) {
      calibratedMs += frameMs
      minCalibrationRms = minOf(minCalibrationRms, rms)
      floor = minCalibrationRms.coerceAtLeast(MIN_FLOOR).coerceAtMost(MAX_FLOOR)
    } else if (rms > threshold) {
      speechMs += frameMs
      silenceMs = 0
    } else {
      silenceMs += frameMs
      if (rms < floor) floor = rms.coerceAtLeast(MIN_FLOOR)
    }
    return when {
      hasSpeech && silenceMs >= endSilenceMs -> ClipDecision.END_OF_SPEECH
      elapsedMs >= maxMs -> if (hasSpeech) ClipDecision.MAX_LENGTH else ClipDecision.NO_SPEECH
      !hasSpeech && elapsedMs >= noSpeechMs -> ClipDecision.NO_SPEECH
      else -> ClipDecision.CONTINUE
    }
  }

  companion object {
    const val CALIBRATION_MS = 200L
    const val CONFIRM_MS = 120L
    const val END_SILENCE_MS = 800L
    const val NO_SPEECH_MS = 4_000L
    const val MAX_MS = 10_000L
    const val MIN_FLOOR = 0.0005f
    const val MAX_FLOOR = 0.03f
    const val MIN_MARGIN = 0.012f

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
