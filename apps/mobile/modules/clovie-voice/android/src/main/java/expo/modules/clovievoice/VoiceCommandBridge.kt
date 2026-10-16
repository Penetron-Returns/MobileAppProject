package expo.modules.clovievoice

import android.os.Handler
import android.os.Looper
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** What the app's JS reports back after running a spoken command. */
data class CommandOutcome(
  /** `done`, `error`, `open_app` (the owner has to finish in the app) or `fallback` (a clip could not be transcribed). */
  val status: String,
  /** Text to show ("Checked in Sipho"). */
  val message: String,
  /** What was heard, when the app transcribed it (a clip); empty otherwise. */
  val transcript: String = "",
  /** Spoken instead of `message` when not blank (the reply plus the approval to confirm). Never shown. */
  val spoken: String = "",
  /** Listen again after speaking, with no wake word. */
  val expectsReply: Boolean = false,
  /** The one approval just read aloud; a yes or no applies to this id only. Empty when none. */
  val pendingApprovalId: String = "",
  val pendingKind: String = "",
  /** JSON of the approvals still to read after the pending one; echoed back to JS as-is. */
  val pendingQueue: String = "",
  val pendingRemaining: Int = 0,
  /** Overrides `status` as the overlay dismiss reason when not blank (`network`). */
  val reason: String = "",
)

/**
 * The hand-off between the service and the app's JS. The service starts a headless task
 * (`VoiceCommandTaskService`) with a command id; the JS task runs the command through the app's
 * own API client and calls `ClovieVoice.completeCommand(id, ...)`, which lands here. If JS never
 * answers, the timeout degrades to `open_app` so the owner can still finish in the app.
 */
object VoiceCommandBridge {
  const val TASK_KEY = "ClovieVoiceCommand"
  /** A command may be a whole companion turn (Nerova runs it before the first byte): well beyond a local check-in. */
  const val TIMEOUT_MS = 35_000L

  /** Upload plus transcription plus the command: longer than a typed transcript. */
  const val CLIP_TIMEOUT_MS = 50_000L

  private val main = Handler(Looper.getMainLooper())
  private val pending = ConcurrentHashMap<String, (CommandOutcome) -> Unit>()

  /**
   * Registers `onOutcome` (called once, on the main thread) and returns the command id. If JS does not
   * answer within `timeoutMs`, `timeoutStatus` is reported instead.
   */
  fun register(
    timeoutMs: Long = TIMEOUT_MS,
    timeoutStatus: String = "open_app",
    onOutcome: (CommandOutcome) -> Unit,
  ): String {
    val id = UUID.randomUUID().toString()
    pending[id] = onOutcome
    main.postDelayed({ complete(id, CommandOutcome(timeoutStatus, "")) }, timeoutMs)
    return id
  }

  fun complete(id: String, outcome: CommandOutcome): Boolean {
    val callback = pending.remove(id) ?: return false
    main.post { callback(outcome) }
    return true
  }

  fun cancelAll() {
    pending.clear()
  }
}
