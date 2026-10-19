package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LatencyOffsetsTest {
  private var now = 5_000L
  private var wall = 1_700_000_000_000L
  private val recorder = TimingRecorder({ now }, { wall }) { _, _ -> }

  private fun advance(ms: Long) {
    now += ms
    wall += ms
  }

  @Test
  fun reportsEachStepRelativeToTheEndOfSpeech() {
    recorder.wake()
    advance(2_000)
    recorder.speechEnded()
    advance(120)
    recorder.finalTranscript()
    advance(30)
    recorder.wallMark("requestSentAt", wall)
    advance(900)
    recorder.wallMark("firstReplyByteAt", wall)
    advance(400)
    recorder.ttsStarted()
    assertEquals(
      mapOf("finalTranscriptMs" to 120L, "requestSentMs" to 150L, "firstReplyByteMs" to 1_050L, "ttsStartMs" to 1_450L),
      recorder.latencyOffsets(),
    )
  }

  @Test
  fun leavesOutStepsThatDidNotHappenAndReportsOncePerTurn() {
    recorder.wake()
    recorder.speechEnded()
    advance(80)
    recorder.finalTranscript()
    assertEquals(mapOf("finalTranscriptMs" to 80L), recorder.latencyOffsets())
    assertNull(recorder.latencyOffsets())
    recorder.resetTurn()
    assertNull(recorder.latencyOffsets()) // no speech end yet in the new turn
  }

  @Test
  fun theFirstEndOfSpeechWins() {
    recorder.wake()
    recorder.speechEnded()
    advance(500)
    recorder.speechEnded() // a late recogniser callback after our own endpointer
    advance(100)
    recorder.finalTranscript()
    assertEquals(600L, recorder.latencyOffsets()?.get("finalTranscriptMs"))
  }

  @Test
  fun nothingToReportBeforeSpeechEnds() {
    recorder.wake()
    assertNull(recorder.latencyOffsets())
  }
}
