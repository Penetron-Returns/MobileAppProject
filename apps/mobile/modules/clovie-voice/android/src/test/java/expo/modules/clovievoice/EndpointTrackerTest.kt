package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EndpointTrackerTest {
  private fun tracker() = EndpointTracker(silenceMs = 400).also {
    it.onRms(-2f, 0) // the room
  }

  @Test
  fun doesNotFinalizeWithoutWords() {
    val t = tracker()
    t.onRms(8f, 100)
    assertFalse(t.shouldFinalize(2_000))
  }

  @Test
  fun doesNotFinalizeWhileStillVoiced() {
    val t = tracker()
    t.onPartial("book thandi", 500)
    t.onRms(8f, 600)
    assertFalse(t.shouldFinalize(900)) // only 300 ms since the last voiced level
  }

  @Test
  fun finalizesOnceSilentAndTheWordsHaveStopped() {
    val t = tracker()
    t.onRms(8f, 400)
    t.onPartial("book thandi tomorrow", 500)
    t.onRms(-2f, 600)
    assertFalse(t.shouldFinalize(799))
    assertTrue(t.shouldFinalize(900))
    assertEquals("book thandi tomorrow", t.text)
  }

  @Test
  fun waitsWhileThePartialIsStillChangingAfterTheVoiceStops() {
    val t = tracker()
    t.onRms(8f, 400)
    t.onPartial("book thandi", 450)
    t.onRms(-2f, 500)
    t.onPartial("book thandi tomorrow", 850) // the recogniser lags the audio
    assertFalse(t.shouldFinalize(1_000))
    assertTrue(t.shouldFinalize(1_250))
  }

  @Test
  fun resumedSpeechRestartsTheSilenceClock() {
    val t = tracker()
    t.onRms(8f, 400)
    t.onPartial("book", 450)
    t.onRms(8f, 800)
    assertFalse(t.shouldFinalize(1_100))
  }

  @Test
  fun resetForgetsEverything() {
    val t = tracker()
    t.onRms(8f, 400)
    t.onPartial("book", 450)
    t.reset()
    assertEquals("", t.text)
    assertFalse(t.shouldFinalize(5_000))
  }
}
