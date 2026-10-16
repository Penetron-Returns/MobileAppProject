package expo.modules.clovievoice

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager

/**
 * Shared audio rules for the cues and the spoken reply. `USAGE_ASSISTANT` (not
 * `USAGE_ASSISTANCE_SONIFICATION`): sonification rides the system stream, which Android mutes in
 * vibrate mode, and these sounds must still play there. Assistant audio follows the media volume.
 */
object VoiceAudio {
  fun attributes(contentType: Int): AudioAttributes =
    AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANT)
      .setContentType(contentType)
      .build()

  /** False only in total silence (ringer silent, or Do Not Disturb set to "total silence"). Vibrate still plays. */
  fun isAudible(context: Context): Boolean {
    val audio = context.getSystemService(AudioManager::class.java) ?: return true
    val filter = context.getSystemService(NotificationManager::class.java)?.currentInterruptionFilter
      ?: NotificationManager.INTERRUPTION_FILTER_ALL
    return CuePolicy.isAudible(audio.ringerMode, filter)
  }
}
