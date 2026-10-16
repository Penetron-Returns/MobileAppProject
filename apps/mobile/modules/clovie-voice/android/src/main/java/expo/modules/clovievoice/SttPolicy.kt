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

/** Which recogniser runs an attempt, and whether it is given a language. */
enum class SttStep(val useOnDevice: Boolean, val hasLocale: Boolean, val isGoogle: Boolean = false) {
  ON_DEVICE(true, true),
  DEFAULT_LOCALE(false, true),
  DEFAULT_NO_LOCALE(false, false),
  GOOGLE_NO_LOCALE(false, false, isGoogle = true),
}

/** One recogniser try: the step, and its 1-based number across the whole listen. */
data class SttAttempt(val step: SttStep, val number: Int = 1)

sealed interface SttNext {
  data class Retry(val attempt: SttAttempt, val delayMs: Long) : SttNext

  /** `reason` is `no_speech`, `permission`, `language` or `error`. */
  data class GiveUp(val reason: String) : SttNext
}

/** What to do after a recogniser error. Pure: no Android types, no clock. */
object SttPolicy {
  const val MAX_ATTEMPTS = 5

  /** A "nothing heard" this soon after starting means the recogniser got no audio, not that the owner was silent. */
  const val FAST_FAIL_MS = 1_000L
  const val RETRY_DELAY_MS = 350L

  /** Order the recognisers are tried in. */
  val ORDER: List<SttStep> = SttStep.values().toList()

  fun isLanguageError(code: Int) = code == SttErrors.LANGUAGE_NOT_SUPPORTED || code == SttErrors.LANGUAGE_UNAVAILABLE

  /** The step after `step`, or null when it was the last. */
  private fun following(step: SttStep): SttStep? = ORDER.getOrNull(ORDER.indexOf(step) + 1)

  /** Moves to the next step without an error (it cannot run here: no on-device model, no Google service). */
  fun skip(current: SttAttempt): SttNext {
    val step = following(current.step)
    return if (step == null || current.number >= MAX_ATTEMPTS) {
      SttNext.GiveUp("language")
    } else {
      SttNext.Retry(SttAttempt(step, current.number + 1), 0L)
    }
  }

  fun next(code: Int, elapsedMs: Long, current: SttAttempt): SttNext {
    val isLastTry = current.number >= MAX_ATTEMPTS
    return when {
      code == SttErrors.INSUFFICIENT_PERMISSIONS -> SttNext.GiveUp("permission")
      code == SttErrors.NO_MATCH || code == SttErrors.SPEECH_TIMEOUT ->
        if (!isLastTry && current.number < 2 && elapsedMs < FAST_FAIL_MS) {
          SttNext.Retry(current.copy(number = current.number + 1), RETRY_DELAY_MS)
        } else {
          SttNext.GiveUp("no_speech")
        }
      isLanguageError(code) -> skip(current)
      isLastTry -> SttNext.GiveUp("error")
      // Busy, audio, client, server, disconnected, network, unknown: the recogniser or the microphone
      // was not ready. Move off the on-device recogniser first, then retry the same one.
      else -> {
        val step = if (current.step.useOnDevice) following(current.step) ?: current.step else current.step
        SttNext.Retry(SttAttempt(step, current.number + 1), RETRY_DELAY_MS)
      }
    }
  }
}

/** What to do when the cloud transcription of an already captured clip fails. */
sealed interface AfterCloudFailure {
  /** Speak an error; `listenAgain` keeps a follow-up conversation going. */
  data class SpeakError(val listenAgain: Boolean) : AfterCloudFailure

  /** Only before capture: the recogniser is still a valid fallback. */
  object Recogniser : AfterCloudFailure
}

/** Whether the on-device recogniser may still run after a cloud failure. Pure. */
object CloudFallback {
  /**
   * The recogniser is only a fallback BEFORE capture (cloud off, no token, capture failed). Once a clip with speech
   * exists the owner has already spoken, so it would hear silence: speak an error instead, and keep a follow-up
   * conversation going within its turn cap.
   */
  fun afterFailure(isClipCaptured: Boolean, isFollowUpTurn: Boolean, followUpsDone: Int, pendingRemaining: Int): AfterCloudFailure =
    if (!isClipCaptured) {
      AfterCloudFailure.Recogniser
    } else {
      AfterCloudFailure.SpeakError(isFollowUpTurn && followUpsDone < FollowUp.maxTurns(pendingRemaining))
    }
}

/** Picks the recognition language from what the phone reports. Pure. */
object SttLanguages {
  private val PREFERRED = listOf("en-ZA", "en-GB", "en-US")

  private fun norm(tag: String) = tag.replace('_', '-')

  /** en-ZA, en-GB, en-US, any other `en-*`, else null (let the device choose). */
  fun choose(candidates: Collection<String>): String? {
    val tags = candidates.map(::norm)
    return PREFERRED.firstOrNull { p -> tags.any { it.equals(p, ignoreCase = true) } }
      ?: tags.firstOrNull { it.startsWith("en-", ignoreCase = true) || it.equals("en", ignoreCase = true) }
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
