package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Test

class SentenceSplitterTest {
  private val cases = listOf(
    "" to emptyList(),
    "   " to emptyList(),
    "Hello there." to listOf("Hello there."),
    "You have three bookings today. The first is at 09:00. Shall I read them?" to
      listOf("You have three bookings today.", "The first is at 09:00.", "Shall I read them?"),
    "It costs 3.5 hours. Fine." to listOf("It costs 3.5 hours. Fine."),
    "See Dr. Smith at 20:30. Bring ID." to listOf("See Dr. Smith at 20:30.", "Bring ID."),
    "Done. Booked." to listOf("Done. Booked."),
    "Wait... are you sure? Say yes or no." to listOf("Wait...", "are you sure?", "Say yes or no."),
    "No punctuation at all" to listOf("No punctuation at all"),
    "Booked for Friday 16 October at 20:30 to 21:15" to listOf("Booked for Friday 16 October at 20:30 to 21:15"),
    "Meet J. Dlamini tomorrow. Thanks!" to listOf("Meet J. Dlamini tomorrow.", "Thanks!"),
  )

  @Test
  fun splitsReplyIntoSpokenSentences() {
    cases.forEach { (input, expected) -> assertEquals(input, expected, SentenceSplitter.split(input)) }
  }
}
