package expo.modules.clovievoice

/**
 * Turns the reply text the app streams in (deltas, as the model writes them) into sentences that can be spoken at
 * once, and remembers what was handed out so the final outcome does not speak it again. Uses [SentenceSplitter], so
 * the boundaries match the speaker's own. A sentence is released when the next one has started (its end is certain),
 * the last one on [finish]. Stops handing out after [MAX_CHARS], like the app's `trimForSpeech`; [remainder] then
 * leaves the rest for the final speech. Pure: no clock, no audio.
 */
class StreamedReply(private val maxChars: Int = MAX_CHARS) {
  private var buffer = ""
  private val emitted = ArrayList<String>()
  private var emittedChars = 0
  private var isCapped = false

  /** Everything handed out so far, as one string. */
  val spokenText: String get() = emitted.joinToString(" ")

  val hasEmitted: Boolean get() = emitted.isNotEmpty()

  fun reset() {
    buffer = ""
    emitted.clear()
    emittedChars = 0
    isCapped = false
  }

  /** Adds a delta; returns the sentences that are now complete (usually none or one). */
  fun append(delta: String): List<String> {
    buffer += clean(delta)
    val parts = SentenceSplitter.split(buffer)
    if (parts.size < 2) return emptyList()
    buffer = parts.last()
    return release(parts.dropLast(1))
  }

  /** The stream ended: the held sentence is complete too. */
  fun finish(): List<String> {
    val parts = SentenceSplitter.split(buffer)
    buffer = ""
    return release(parts)
  }

  private fun release(sentences: List<String>): List<String> {
    val out = ArrayList<String>()
    for (sentence in sentences) {
      // Past the cap nothing more is handed out, so what was spoken is always a prefix of the reply.
      if (isCapped || emittedChars + sentence.length > maxChars) {
        isCapped = true
        break
      }
      emitted.add(sentence)
      emittedChars += sentence.length + 1
      out.add(sentence)
    }
    return out
  }

  /**
   * What is left of `spoken` (the app's text for the whole reply) after the sentences already spoken: null when
   * nothing is left. When `spoken` does not start with what was spoken it is returned whole, so nothing is lost.
   */
  fun remainder(spoken: String?): String? {
    if (!hasEmitted || spoken == null) return spoken
    val text = clean(spoken).trim().replace(WHITESPACE, " ")
    val done = spokenText
    if (!text.startsWith(done)) return spoken
    return text.removePrefix(done).trim().ifEmpty { null }
  }

  private fun clean(text: String): String = text.replace(MARKDOWN, "")

  private companion object {
    const val MAX_CHARS = 400
    val MARKDOWN = Regex("[*_`#~]+")
    val WHITESPACE = Regex("\\s+")
  }
}
