package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SttOrderTest {
  private val online = SttPolicy.orderFor(true)

  @Test
  fun onlineTriesTheDefaultRecogniserFirstAndOnDeviceNext() {
    assertEquals(SttStep.DEFAULT_LOCALE, online.first())
    assertEquals(SttStep.ON_DEVICE, online[1])
    assertEquals(SttStep.values().toSet(), online.toSet())
  }

  @Test
  fun offlineTriesOnDeviceFirst() {
    assertEquals(SttStep.ON_DEVICE, SttPolicy.orderFor(false).first())
  }

  @Test
  fun onDeviceNothingHeardWithoutSpeechMovesOnWhenOnline() {
    val order = SttPolicy.orderFor(true)
    for (code in listOf(SttErrors.NO_MATCH, SttErrors.SPEECH_TIMEOUT)) {
      val next = SttPolicy.next(code, 5_575L, SttAttempt(SttStep.ON_DEVICE, 2), order, isOnline = true, heardAnything = false)
      assertEquals(SttNext.Retry(SttAttempt(SttStep.DEFAULT_NO_LOCALE, 3), 0L), next)
    }
  }

  @Test
  fun onDeviceNothingHeardGivesUpWhenOfflineOrWhenSpeechWasHeard() {
    val order = SttPolicy.orderFor(false)
    val offline = SttPolicy.next(SttErrors.NO_MATCH, 5_000L, SttAttempt(SttStep.ON_DEVICE), order, isOnline = false, heardAnything = false)
    assertEquals(SttNext.GiveUp("no_speech"), offline)
    val heard = SttPolicy.next(SttErrors.NO_MATCH, 5_000L, SttAttempt(SttStep.ON_DEVICE), SttPolicy.orderFor(true), isOnline = true, heardAnything = true)
    assertEquals(SttNext.GiveUp("no_speech"), heard)
  }

  @Test
  fun onlineNothingHeardIsOwnerSilence() {
    val next = SttPolicy.next(SttErrors.NO_MATCH, 5_000L, SttAttempt(SttStep.DEFAULT_LOCALE), online, isOnline = true, heardAnything = false)
    assertEquals(SttNext.GiveUp("no_speech"), next)
  }

  @Test
  fun fastFailStillRetriesTheSameStepOnce() {
    val next = SttPolicy.next(SttErrors.NO_MATCH, 200L, SttAttempt(SttStep.DEFAULT_LOCALE), online, isOnline = true, heardAnything = false)
    assertTrue(next is SttNext.Retry && next.attempt.step == SttStep.DEFAULT_LOCALE && next.attempt.number == 2)
  }

  @Test
  fun skipFollowsTheGivenOrder() {
    assertEquals(SttNext.Retry(SttAttempt(SttStep.ON_DEVICE, 2), 0L), SttPolicy.skip(SttAttempt(SttStep.DEFAULT_LOCALE), online))
  }

  @Test
  fun onlineLocaleUsesTheDeviceEnglishElseTheUsualChoice() {
    assertEquals("en-ZA", SttLanguages.chooseOnline("en-ZA", listOf("en-GB")))
    assertEquals("en-GB", SttLanguages.chooseOnline("af-ZA", listOf("en-GB", "en-US")))
    assertEquals("en-ZA", SttLanguages.chooseOnline(null, listOf("en-US", "en-ZA")))
  }
}
