package expo.modules.clovievoice

import android.os.Handler
import android.os.Looper
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** What the app's JS reports back after running a spoken command. */
data class CommandOutcome(
  /** `done`, `error`, or `open_app` (the owner has to finish in the app). */
  val status: String,
  /** Text to show ("Checked in Sipho"). */
  val message: String,
)

/**
 * The hand-off between the service and the app's JS. The service starts a headless task
 * (`VoiceCommandTaskService`) with a command id; the JS task runs the command through the app's
 * own API client and calls `ClovieVoice.completeCommand(id, ...)`, which lands here. If JS never
 * answers, the timeout degrades to `open_app` so the owner can still finish in the app.
 */
object VoiceCommandBridge {
  const val TASK_KEY = "ClovieVoiceCommand"
  const val TIMEOUT_MS = 8_000L

  private val main = Handler(Looper.getMainLooper())
  private val pending = ConcurrentHashMap<String, (CommandOutcome) -> Unit>()

  /** Registers `onOutcome` (called once, on the main thread) and returns the command id. */
  fun register(onOutcome: (CommandOutcome) -> Unit): String {
    val id = UUID.randomUUID().toString()
    pending[id] = onOutcome
    main.postDelayed({ complete(id, CommandOutcome("open_app", "")) }, TIMEOUT_MS)
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
