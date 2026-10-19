package expo.modules.clovievoice

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VoiceRankingTest {
  private fun voice(
    name: String,
    locale: Locale = Locale("en", "ZA"),
    quality: Int = 300,
    latency: Int = 300,
    network: Boolean = false,
    features: Set<String> = emptySet(),
  ) = VoiceCandidate(name, locale, quality, latency, network, features)

  private fun pick(vararg v: VoiceCandidate) = VoiceRanking.pick(v.toList(), Locale("en", "ZA"))?.name

  @Test fun noVoicesGivesNull() = assertNull(pick())

  @Test fun otherLanguagesAreIgnored() = assertNull(pick(voice("fr", Locale.FRANCE)))

  @Test fun notInstalledVoicesAreSkipped() =
    assertEquals("b", pick(voice("a", quality = 500, features = setOf("notInstalled")), voice("b", quality = 200)))

  @Test fun exactRegionBeatsHigherQualityOtherRegion() =
    assertEquals("za", pick(voice("za", quality = 200), voice("us", Locale.US, quality = 500)))

  @Test fun sameLanguageDifferentRegionIsAcceptable() = assertEquals("us", pick(voice("us", Locale.US)))

  @Test fun higherQualityWins() = assertEquals("hi", pick(voice("lo", quality = 300), voice("hi", quality = 400)))

  @Test fun offlineWinsOverNetworkOfSimilarQuality() =
    assertEquals("off", pick(voice("net", quality = 400, network = true), voice("off", quality = 400)))

  @Test fun clearlyBetterNetworkVoiceWins() =
    assertEquals("net", pick(voice("off", quality = 200), voice("net", quality = 500, network = true)))

  @Test fun lowerLatencyBreaksTies() = assertEquals("fast", pick(voice("slow", latency = 400), voice("fast", latency = 200)))
}
