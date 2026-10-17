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
      VoiceCommandBridge.CLIP_TIMEOUT_MS, // a clip (upload, then a whole companion turn) is the longest case
      true, // also when the app is in the foreground
    )
  }

  companion object {
    const val EXTRA_ID = "id"
    const val EXTRA_TRANSCRIPT = "transcript"

    /** Wall-clock ms (as a string) when the service asked for this task, so JS can report how long it took to start. */
    const val EXTRA_STARTED_AT = "startedAt"

    /** Start the JS runtime and load today's bookings now; there is no command yet (and no `id`). */
    const val EXTRA_PREFETCH = "prefetch"

    /** Absolute path of a clip (m4a, or WAV as a fallback) for the app to transcribe (instead of `transcript`). */
    const val EXTRA_CLIP_PATH = "clipPath"

    /** Follow-up turns: the approval just read aloud, its kind and the JSON of those still queued (see FollowUpState). */
    const val EXTRA_PENDING_APPROVAL_ID = "pendingApprovalId"
    const val EXTRA_PENDING_KIND = "pendingKind"
    const val EXTRA_PENDING_QUEUE = "pendingQueue"

    /** Follow-up turns after an executed action: its id and when its undo window closes (epoch ms, as a string). */
    const val EXTRA_PENDING_ACTION_ID = "pendingActionId"
    const val EXTRA_UNDO_UNTIL_MS = "undoUntilMs"
  }
}
