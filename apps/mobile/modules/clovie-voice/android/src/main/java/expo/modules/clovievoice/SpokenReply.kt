package expo.modules.clovievoice

import java.util.Locale

/** What Clovie says aloud for an outcome. Pure, so the wording rules are unit tested. */
object SpokenReply {
  const val NOT_HEARD_SPOKEN = "Sorry, I didn't catch that."
  const val SPEECH_UNAVAILABLE_SPOKEN = "Speech isn't set up on this phone."

  /** For replies that need the app: never read the transcript back, it can hold a client's name. */
  const val NEEDS_APP_SPOKEN = "I need the app for that. Tap Open Clovie."
  private const val MAX_CHARS = 200

  /**
   * `status` is the outcome status (`done`, `error`, `open_app`). `notHeard` and `speechUnavailable` are
   * the service's two fixed error messages, which the overlay renders by its own wording.
   */
  fun forOutcome(status: String, message: String, notHeard: String, speechUnavailable: String, spoken: String = ""): String? {
    if (status == "open_app") return NEEDS_APP_SPOKEN
    if (status != "done" && status != "error") return null
    // The app wrote this for speech (the reply and the approval to confirm): read whole, never cut mid-sentence here.
    if (status == "done" && spoken.isNotBlank()) return spoken.trim()
    val text = message.trim()
    return when {
      text == notHeard || text.isEmpty() && status == "error" -> NOT_HEARD_SPOKEN
      text == speechUnavailable -> SPEECH_UNAVAILABLE_SPOKEN
      text.isEmpty() -> null
      text.length > MAX_CHARS -> text.take(MAX_CHARS)
      else -> text
    }
  }
}

/** Picks the voice language: English (South Africa), else en-GB, else leave the phone's default. */
object SpeechLocalePolicy {
  val PREFERENCE: List<Locale> = listOf(Locale("en", "ZA"), Locale("en", "GB"))

  fun pick(isAvailable: (Locale) -> Boolean): Locale? = PREFERENCE.firstOrNull(isAvailable)
}
