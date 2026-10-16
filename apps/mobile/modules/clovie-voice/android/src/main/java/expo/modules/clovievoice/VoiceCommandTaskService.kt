package expo.modules.clovievoice

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the app's `ClovieVoiceCommand` headless JS task (registered in
 * src/features/voice/headlessTask.ts), even with the app in the background. It may start because
 * the voice foreground service is running.
 */
class VoiceCommandTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(
      VoiceCommandBridge.TASK_KEY,
      Arguments.fromBundle(extras),
      VoiceCommandBridge.TIMEOUT_MS,
      true, // also when the app is in the foreground
    )
  }

  companion object {
    const val EXTRA_ID = "id"
    const val EXTRA_TRANSCRIPT = "transcript"

    /** Absolute path of a WAV clip for the app to transcribe (instead of `transcript`). */
    const val EXTRA_CLIP_PATH = "clipPath"
  }
}
