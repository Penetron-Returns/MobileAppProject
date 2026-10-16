package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeechGateTest {
  private fun chunk(amplitude: Short, size: Int = 1_280) = ShortArray(size) { amplitude }

  @Test
  fun staysClosedOnSilence() {
    val gate = SpeechGate()
    var now = 0L
    repeat(50) {
      now += 80
      assertFalse(gate.update(chunk(10), 1_280, now))
    }
  }

  @Test
  fun staysClosedOnQuietRoomNoise() {
    val gate = SpeechGate()
    assertFalse(gate.update(chunk(150), 1_280, 80)) // about -47 dBFS
  }

  @Test
  fun opensOnSpeechLevelAndHoldsForTheHangover() {
    val gate = SpeechGate(hangoverMs = 2_200)
    assertTrue(gate.update(chunk(4_000), 1_280, 1_000))
    assertTrue(gate.isActive(3_000))
    assertFalse(gate.isActive(3_300))
  }

  @Test
  fun closesAgainAfterSpeechStops() {
    val gate = SpeechGate(hangoverMs = 1_000)
    gate.update(chunk(4_000), 1_280, 0)
    assertFalse(gate.update(chunk(5), 1_280, 1_500))
  }

  @Test
  fun emptyChunkKeepsTheCurrentState() {
    val gate = SpeechGate(hangoverMs = 1_000)
    gate.update(chunk(4_000), 1_280, 0)
    assertTrue(gate.update(ShortArray(0), 0, 500))
  }

  @Test
  fun loudBackgroundDoesNotRaiseTheFloorPastSpeech() {
    val gate = SpeechGate(hangoverMs = 100)
    var now = 0L
    repeat(100) { now += 80; gate.update(chunk(2_000), 1_280, now) }
    // Normal speech still clears the (slowly risen) floor.
    now += 500
    assertTrue(gate.update(chunk(12_000), 1_280, now))
  }
}

class PredictionScheduleTest {
  @Test
  fun doesNotRunTheModelsWithoutSpeech() {
    assertFalse(PredictionSchedule.shouldPredict(false, 32_000, 32_000, 4, 2))
  }

  @Test
  fun waitsForAFullWindow() {
    assertFalse(PredictionSchedule.shouldPredict(true, 31_000, 32_000, 4, 2))
  }

  @Test
  fun runsOnEveryNthRead() {
    assertEquals(
      listOf(false, true, false, true),
      (1..4).map { PredictionSchedule.shouldPredict(true, 32_000, 32_000, it, 2) },
    )
  }
}
