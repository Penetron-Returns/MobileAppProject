package expo.modules.clovievoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings

/**
 * The sound and touch of a voice interaction, one distinct cue per state (see [Cue]), all generated
 * here with nothing bundled, plus two light haptic ticks at the entrance. Sounds follow the owner's
 * "Sounds" setting and play unless the phone is in total silence; they do not depend on the system
 * "touch sounds" setting, which many people leave off. Haptics follow the touch-feedback setting.
 */
class VoiceFeedback(private val context: Context) {
  private val main = Handler(Looper.getMainLooper())
  private val vibrator: Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  private val samples = HashMap<Cue, ShortArray>()
  private val active = ArrayList<AudioTrack>()
  private var isProcessing = false
  private val pulse = object : Runnable {
    override fun run() {
      play(Cue.PULSE)
      main.postDelayed(this, CuePolicy.PULSE_EVERY_MS)
    }
  }

  /** At the ignition: wake chime and a light tick; a softer tick follows as Clovie lands. */
  fun ignite() {
    stopPulse()
    play(Cue.WAKE)
    tick(strong = true)
    main.postDelayed({ tick(strong = false) }, LANDING_MS)
  }

  /** Listening again after a spoken question (no wake word): the wake chime alone, no haptic tick. */
  fun listeningAgain() {
    stopPulse()
    play(Cue.WAKE)
  }

  /** Listening ended and the words are being understood: a soft "got it", then a faint pulse if it takes long. */
  fun processing() {
    if (isProcessing) return
    isProcessing = true
    play(Cue.PROCESSING)
    main.postDelayed(pulse, CuePolicy.PULSE_AFTER_MS)
  }

  /**
   * The owner has stopped speaking: the same soft "got it" cue as [processing], at once, plus a light tick when touch
   * feedback is on, so she knows she was heard before the transcript and the request are even done.
   */
  fun acknowledge() {
    if (isProcessing) return
    processing()
    tick(strong = false)
  }

  /** The result is here: the pulse stops at once, and the success or failure cue plays. */
  fun result(cue: Cue) {
    stopPulse()
    play(cue)
  }

  /** How long until speech may start so it follows the cue rather than talking over it (0 when no cue will sound). */
  fun leadInMs(cue: Cue): Long =
    if (VoiceFeedbackSettings.isSoundsEnabled(context) && isAudible()) CueScores.durationMs(cue).toLong() else 0L

  fun cancel() {
    stopPulse()
    main.removeCallbacksAndMessages(null)
    active.toList().forEach(::release)
  }

  private fun stopPulse() {
    isProcessing = false
    main.removeCallbacks(pulse)
  }

  private fun play(cue: Cue) {
    if (!VoiceFeedbackSettings.isSoundsEnabled(context) || !isAudible()) return
    try {
      val pcm = samples.getOrPut(cue) { CueSynth.synthesize(cue) }
      val track = AudioTrack.Builder()
        .setAudioAttributes(VoiceAudio.attributes(AudioAttributes.CONTENT_TYPE_SONIFICATION))
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(CueSynth.SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build(),
        )
        .setBufferSizeInBytes(pcm.size * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()
      track.write(pcm, 0, pcm.size)
      track.play()
      active.add(track)
      main.postDelayed({ release(track) }, CueScores.durationMs(cue) + 150L)
    } catch (_: RuntimeException) {
      // No audio output; carry on silently.
    }
  }

  private fun release(track: AudioTrack) {
    if (!active.remove(track)) return
    try {
      track.release()
    } catch (_: RuntimeException) {
      // Already released.
    }
  }

  private fun isAudible() = VoiceAudio.isAudible(context)

  private fun tick(strong: Boolean) {
    val device = vibrator ?: return
    if (!device.hasVibrator()) return
    val effect = when {
      strong && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
        VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
      device.hasAmplitudeControl() ->
        VibrationEffect.createOneShot(if (strong) 14L else 10L, if (strong) 90 else 45)
      else -> VibrationEffect.createOneShot(10L, VibrationEffect.DEFAULT_AMPLITUDE)
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        // Touch usage: the system applies the owner's touch-feedback setting.
        device.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH))
      } else {
        val enabled = Settings.System.getInt(context.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 1
        if (enabled) device.vibrate(effect)
      }
    } catch (_: RuntimeException) {
      // Vibration unavailable.
    }
  }

  private companion object {
    const val LANDING_MS = 550L
  }
}
