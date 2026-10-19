package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamedReplyTest {
  private fun feed(reply: StreamedReply, vararg deltas: String): List<String> = deltas.flatMap { reply.append(it) }

  @Test
  fun releasesASentenceOnlyOnceTheNextOneHasStarted() {
    val r = StreamedReply()
    assertEquals(emptyList<String>(), feed(r, "You have ", "two bookings", "."))
    assertEquals(listOf("You have two bookings."), feed(r, " The first"))
    assertEquals(listOf("The first is at 10:30."), feed(r, " is at 10:30", ". ", "Then we go"))
  }

  @Test
  fun finishReleasesTheHeldSentence() {
    val r = StreamedReply()
    feed(r, "Two bookings.")
    assertEquals(listOf("Two bookings."), r.finish())
    assertEquals(emptyList<String>(), r.finish())
  }

  @Test
  fun doesNotSplitDecimalsTimesOrAbbreviations() {
    val r = StreamedReply()
    assertEquals(emptyList<String>(), feed(r, "It costs 3.5 at 20:30 with Dr. Smith"))
    assertEquals(listOf("It costs 3.5 at 20:30 with Dr. Smith."), feed(r, ". Next one is"))
  }

  @Test
  fun stripsMarkdownMarks() {
    val r = StreamedReply()
    assertEquals(listOf("Two bookings today."), feed(r, "**Two** bookings today", ". Next one is"))
  }

  @Test
  fun remainderIsWhatWasNotSpokenYet() {
    val r = StreamedReply()
    feed(r, "Two bookings today. The first is at 10:30. Shall I move it?")
    r.finish()
    assertEquals("Two bookings today. The first is at 10:30. Shall I move it?", r.spokenText)
    assertNull(r.remainder("Two bookings today. The first is at 10:30. Shall I move it?"))
    assertEquals("Book Gel at 10:30 on Friday. Say yes or no.", r.remainder("Two bookings today. The first is at 10:30. Shall I move it? Book Gel at 10:30 on Friday. Say yes or no."))
  }

  @Test
  fun remainderKeepsTheWholeTextWhenItDoesNotStartWithWhatWasSpoken() {
    val r = StreamedReply()
    feed(r, "Hello there. Next one")
    assertEquals("Done. Booked.", r.remainder("Done. Booked."))
  }

  @Test
  fun remainderIsUnchangedWhenNothingWasStreamed() {
    val r = StreamedReply()
    assertEquals("Hello.", r.remainder("Hello."))
    assertNull(r.remainder(null))
    assertFalse(r.hasEmitted)
  }

  @Test
  fun stopsHandingOutAfterTheCharacterCapAndLeavesTheRest() {
    val r = StreamedReply(maxChars = 30)
    val out = feed(r, "First sentence here. ", "Second sentence is longer than the cap. ", "Third.")
    out.forEach { }
    assertEquals(listOf("First sentence here."), out + r.finish())
    assertEquals("Second sentence is longer than the cap. Third.", r.remainder("First sentence here. Second sentence is longer than the cap. Third."))
  }

  @Test
  fun resetForgetsEverything() {
    val r = StreamedReply()
    feed(r, "One thing. Another")
    r.reset()
    assertTrue(r.finish().isEmpty())
    assertFalse(r.hasEmitted)
  }
}
