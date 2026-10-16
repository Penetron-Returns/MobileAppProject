package expo.modules.clovievoice

/** Android `SpeechRecognizer.ERROR_*` code names for logs. Pure, so it is unit tested. */
object SttErrors {
  const val NETWORK_TIMEOUT = 1
  const val NETWORK = 2
  const val AUDIO = 3
  const val SERVER = 4
  const val CLIENT = 5
  const val SPEECH_TIMEOUT = 6
  const val NO_MATCH = 7
  const val RECOGNIZER_BUSY = 8
  const val INSUFFICIENT_PERMISSIONS = 9
  const val TOO_MANY_REQUESTS = 10
  const val SERVER_DISCONNECTED = 11
  const val LANGUAGE_NOT_SUPPORTED = 12
  const val LANGUAGE_UNAVAILABLE = 13

  fun name(code: Int): String =
    when (code) {
      NETWORK_TIMEOUT -> "NETWORK_TIMEOUT"
      NETWORK -> "NETWORK"
      AUDIO -> "AUDIO"
      SERVER -> "SERVER"
      CLIENT -> "CLIENT"
      SPEECH_TIMEOUT -> "SPEECH_TIMEOUT"
      NO_MATCH -> "NO_MATCH"
      RECOGNIZER_BUSY -> "RECOGNIZER_BUSY"
      INSUFFICIENT_PERMISSIONS -> "INSUFFICIENT_PERMISSIONS"
      TOO_MANY_REQUESTS -> "TOO_MANY_REQUESTS"
      SERVER_DISCONNECTED -> "SERVER_DISCONNECTED"
      LANGUAGE_NOT_SUPPORTED -> "LANGUAGE_NOT_SUPPORTED"
      LANGUAGE_UNAVAILABLE -> "LANGUAGE_UNAVAILABLE"
      else -> "UNKNOWN_$code"
    }
}

/** One recogniser try: which language, and whether the on-device recogniser (else the default) runs it. */
data class SttAttempt(val localeIndex: Int, val useOnDevice: Boolean, val number: Int = 1)

sealed interface SttNext {
  data class Retry(val attempt: SttAttempt, val delayMs: Long) : SttNext

  /** `reason` is `no_speech`, `permission` or `error`. */
  data class GiveUp(val reason: String) : SttNext
}

/** What to do after a recogniser error. Pure: no Android types, no clock. */
object SttPolicy {
  const val MAX_ATTEMPTS = 4

  /** A "nothing heard" this soon after starting means the recogniser got no audio, not that the owner was silent. */
  const val FAST_FAIL_MS = 1_000L
  const val RETRY_DELAY_MS = 350L

  fun next(code: Int, elapsedMs: Long, current: SttAttempt, localeCount: Int): SttNext {
    val again = current.copy(number = current.number + 1)
    val isLastTry = current.number >= MAX_ATTEMPTS
    return when {
      code == SttErrors.INSUFFICIENT_PERMISSIONS -> SttNext.GiveUp("permission")
      code == SttErrors.NO_MATCH || code == SttErrors.SPEECH_TIMEOUT ->
        if (!isLastTry && current.number < 2 && elapsedMs < FAST_FAIL_MS) {
          SttNext.Retry(again, RETRY_DELAY_MS)
        } else {
          SttNext.GiveUp("no_speech")
        }
      isLastTry -> SttNext.GiveUp("error")
      code == SttErrors.LANGUAGE_NOT_SUPPORTED || code == SttErrors.LANGUAGE_UNAVAILABLE ->
        when {
          current.localeIndex < localeCount - 1 ->
            SttNext.Retry(again.copy(localeIndex = current.localeIndex + 1), 0L)
          // Every language missing on-device: try the default recogniser from the first language again.
          current.useOnDevice -> SttNext.Retry(again.copy(localeIndex = 0, useOnDevice = false), 0L)
          else -> SttNext.GiveUp("error")
        }
      // Busy, audio, client, server, disconnected, network, unknown: the recogniser or the microphone
      // was not ready. Move off the on-device recogniser first, then retry the same one.
      else -> SttNext.Retry(again.copy(useOnDevice = false), RETRY_DELAY_MS)
    }
  }
}

/** Decisions at the end of an interaction and after the wake listener fails. Pure. */
object InteractionPolicy {
  enum class After { REARM, STOP }

  /** One-shot (tile, widget, side key) interactions stop the service; hands-free ones re-arm the wake word. */
  fun after(isHandsFree: Boolean): After = if (isHandsFree) After.REARM else After.STOP

  const val MAX_REARM_FAILURES = 3
  private const val REARM_BASE_MS = 400L

  /** Delay before retrying a wake listener that failed to open the microphone; null once it should give up. */
  fun rearmRetryDelayMs(failures: Int): Long? =
    if (failures in 1..MAX_REARM_FAILURES) REARM_BASE_MS * failures else null
}
