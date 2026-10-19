package expo.modules.clovievoice

/**
 * Splits a reply into sentences so text-to-speech can start on the first one and queue the rest. Splits only at
 * `. ! ? …` followed by a space (so "3.5" and "20:30" stay whole), not after common abbreviations or a single
 * initial, and joins fragments shorter than [MIN_CHARS] to the next sentence so the voice does not stutter. Pure.
 */
object SentenceSplitter {
  const val MIN_CHARS = 6
  private val ABBREVIATIONS = setOf("dr", "mr", "mrs", "ms", "st", "no", "vs", "e.g", "i.e", "a.m", "p.m", "approx")
  private const val TERMINATORS = ".!?…"
  private const val TRAILERS = ".!?…\"')”"

  fun split(text: String): List<String> {
    val clean = text.trim().replace(Regex("""\s+"""), " ")
    if (clean.isEmpty()) return emptyList()
    val raw = ArrayList<String>()
    var start = 0
    var i = 0
    while (i < clean.length) {
      if (clean[i] !in TERMINATORS) {
        i++
        continue
      }
      var end = i + 1
      while (end < clean.length && clean[end] in TRAILERS) end++
      val isBoundary = end == clean.length || clean[end] == ' '
      if (isBoundary && !(clean[i] == '.' && endsWithAbbreviation(clean, start, i))) {
        raw.add(clean.substring(start, end).trim())
        start = end
      }
      i = end
    }
    if (start < clean.length) raw.add(clean.substring(start).trim())
    return joinShort(raw.filter { it.isNotEmpty() })
  }

  private fun endsWithAbbreviation(text: String, from: Int, dotIndex: Int): Boolean {
    var begin = dotIndex
    while (begin > from && text[begin - 1] != ' ') begin--
    val word = text.substring(begin, dotIndex).lowercase()
    return word in ABBREVIATIONS || (word.length == 1 && word[0].isLetter())
  }

  private fun joinShort(parts: List<String>): List<String> {
    val out = ArrayList<String>()
    var carry = ""
    for (part in parts) {
      val joined = if (carry.isEmpty()) part else "$carry $part"
      if (joined.length < MIN_CHARS) carry = joined else {
        out.add(joined)
        carry = ""
      }
    }
    if (carry.isNotEmpty()) if (out.isEmpty()) out.add(carry) else out[out.lastIndex] = out.last() + " " + carry
    return out
  }
}
