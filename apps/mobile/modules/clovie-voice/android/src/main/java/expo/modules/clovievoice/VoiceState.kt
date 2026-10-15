package expo.modules.clovievoice

import java.util.concurrent.CopyOnWriteArraySet

/** The service's lifecycle as the app sees it. Mirrors `ClovieVoiceStatus` in src/ClovieVoice.types.ts. */
object VoiceStatus {
  const val OFF = "off"
  const val NOT_CONFIGURED = "not_configured"
  const val STARTING = "starting"
  const val LISTENING = "listening"
  /** The wake word was heard and the owner's command is being captured. */
  const val BUSY = "busy"
  const val ERROR = "error"
}

/** Machine-readable reasons for `VoiceStatus.ERROR`. Mirrors `ClovieVoiceError`. */
object VoiceError {
  const val PERMISSION_DENIED = "permission_denied"
  const val BACKGROUND_START_BLOCKED = "background_start_blocked"
  const val MODEL_LOAD_FAILED = "model_load_failed"
  const val AUDIO_FAILED = "audio_failed"
  const val INFERENCE_FAILED = "inference_failed"
}

data class VoiceSnapshot(val status: String, val error: String?)

/**
 * The one place the service and the Expo module agree on the current status.
 * Both live in the app process, so a plain singleton with listeners is enough.
 */
object VoiceState {
  private val listeners = CopyOnWriteArraySet<(VoiceSnapshot) -> Unit>()

  @Volatile
  var snapshot = VoiceSnapshot(VoiceStatus.OFF, null)
    private set

  fun update(status: String, error: String? = null) {
    val next = VoiceSnapshot(status, error)
    if (next == snapshot) return
    snapshot = next
    listeners.forEach { it(next) }
  }

  fun addListener(listener: (VoiceSnapshot) -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: (VoiceSnapshot) -> Unit) {
    listeners.remove(listener)
  }
}
