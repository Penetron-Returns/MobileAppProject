package expo.modules.clovievoice

import java.util.Locale

/** The facts about an installed TTS voice that ranking needs (a plain copy of `android.speech.tts.Voice`). */
data class VoiceCandidate(
  val name: String,
  val locale: Locale,
  val quality: Int,
  val latency: Int,
  val isNetworkRequired: Boolean,
  val features: Set<String>,
)

/**
 * Picks the most natural-sounding voice for a language. Pure, so it is unit tested without a phone.
 * Rules: same language only; never a voice flagged "notInstalled"; prefer the exact region (en-ZA over en-US);
 * then higher quality; then offline over network (a network voice only wins when its quality is clearly higher,
 * [NETWORK_QUALITY_MARGIN]) because offline voices start speaking sooner; then lower latency.
 */
object VoiceRanking {
  /** Mirrors `Voice.QUALITY_VERY_HIGH` (500) / `QUALITY_HIGH` (400) steps: a network voice must beat offline by this much. */
  const val NETWORK_QUALITY_MARGIN = 100
  private const val NOT_INSTALLED = "notInstalled"

  fun pick(candidates: List<VoiceCandidate>, locale: Locale): VoiceCandidate? {
    val usable = candidates.filter { it.locale.language == locale.language && NOT_INSTALLED !in it.features }
    return usable.sortedWith(compareByDescending<VoiceCandidate> { it.locale.country == locale.country }
      .thenByDescending { effectiveQuality(it) }
      .thenBy { it.isNetworkRequired }
      .thenBy { it.latency }
      .thenBy { it.name }).firstOrNull()
  }

  /** A network voice is only credited with its quality above the margin, so it must clearly beat an offline one. */
  private fun effectiveQuality(voice: VoiceCandidate): Int =
    if (voice.isNetworkRequired) voice.quality - NETWORK_QUALITY_MARGIN else voice.quality
}
