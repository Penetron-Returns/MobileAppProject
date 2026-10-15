package expo.modules.clovievoice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/**
 * The sound and touch of the entrance: a soft two-note rising chime (generated here, nothing
 * bundled, ~300 ms) and two light haptic ticks, one at ignition and a softer one when Clovie lands.
 * Both are skipped when the phone is silent or the owner turned off touch sounds / haptics.
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
  private val chime: ShortArray by lazy { synthesizeChime() }

  /** At the ignition: chime and a light tick; a softer tick follows as Clovie lands. */
  fun ignite() {
    playChime()
    tick(strong = true)
    main.postDelayed({ tick(strong = false) }, LANDING_MS)
  }

  fun cancel() {
    main.removeCallbacksAndMessages(null)
  }

  private fun playChime() {
    if (!isSoundAllowed()) return
    try {
      val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      val format = AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(SAMPLE_RATE)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build()
      val track = AudioTrack.Builder()
        .setAudioAttributes(attributes)
        .setAudioFormat(format)
        .setBufferSizeInBytes(chime.size * 2)
        .setTransferMode(AudioTrack.MODE_STATIC)
        .build()
      track.write(chime, 0, chime.size)
      track.play()
      main.postDelayed({ track.release() }, CHIME_MS + 150L)
    } catch (_: RuntimeException) {
      // No audio output; carry on silently.
    }
  }

  private fun isSoundAllowed(): Boolean {
    val audio = context.getSystemService(AudioManager::class.java)
    if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) return false
    // "Touch sounds" in system settings.
    return Settings.System.getInt(context.contentResolver, Settings.System.SOUND_EFFECTS_ENABLED, 1) == 1
  }

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

  /** E5 then A5, each a soft sine with a whisper of its octave and a quick decay. */
  private fun synthesizeChime(): ShortArray {
    val total = (SAMPLE_RATE * CHIME_MS / 1000)
    val out = FloatArray(total)
    for ((index, note) in listOf(659.25 to 0, 880.0 to 110).withIndex()) {
      val (frequency, startMs) = note
      val start = SAMPLE_RATE * startMs / 1000
      val length = SAMPLE_RATE * 190 / 1000
      for (i in 0 until length) {
        val at = start + i
        if (at >= total) break
        val t = i / SAMPLE_RATE.toDouble()
        val attack = (t / 0.008).coerceAtMost(1.0)
        val envelope = attack * exp(-t * 13.0)
        val tone = sin(2 * PI * frequency * t) + 0.18 * sin(4 * PI * frequency * t)
        out[at] += (tone * envelope * (if (index == 0) 0.24 else 0.3)).toFloat()
      }
    }
    return ShortArray(total) { (out[it].coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort() }
  }

  private companion object {
    const val SAMPLE_RATE = 44_100
    const val CHIME_MS = 300
    const val LANDING_MS = 550L
  }
}
