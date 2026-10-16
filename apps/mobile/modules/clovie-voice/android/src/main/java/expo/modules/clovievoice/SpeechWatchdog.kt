package expo.modules.clovievoice

/**
 * How long the overlay may wait on the text-to-speech engine before giving up. Tracks the speech itself: a short
 * bound for it to START, then a bound that grows with the text for it to FINISH, so a long reply is never cut off.
 */
object SpeechWatchdog {
  /** The engine must begin speaking within this, counted from when speech is requested (after the cue). */
  const val START_WAIT_MS = 5_000L
  const val DONE_BASE_MS = 6_000L
  const val DONE_PER_CHAR_MS = 90L
  const val DONE_MAX_MS = 60_000L

  /** The longest a reply of `textLength` characters may take once it has started: 6 s + 90 ms per character, at most 60 s. */
  fun doneBoundMs(textLength: Int): Long =
    minOf(DONE_MAX_MS, DONE_BASE_MS + DONE_PER_CHAR_MS * maxOf(0, textLength))
}
