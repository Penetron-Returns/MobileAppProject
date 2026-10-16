package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FollowUpTest {
  @Test
  fun listensAgainForADoneOutcomeThatExpectsAReply() {
    assertTrue(FollowUp.shouldListenAgain("done", expectsReply = true, turnsDone = 0, pendingRemaining = 0))
  }

  @Test
  fun neverListensAgainWithoutAnExpectedReplyOrAfterAFailure() {
    assertFalse(FollowUp.shouldListenAgain("done", expectsReply = false, turnsDone = 0, pendingRemaining = 0))
    assertFalse(FollowUp.shouldListenAgain("error", expectsReply = true, turnsDone = 0, pendingRemaining = 0))
    assertFalse(FollowUp.shouldListenAgain("open_app", expectsReply = true, turnsDone = 0, pendingRemaining = 0))
    assertFalse(FollowUp.shouldListenAgain("fallback", expectsReply = true, turnsDone = 0, pendingRemaining = 0))
  }

  @Test
  fun allowsThreeFollowUpsPerWakeAndNoMore() {
    assertTrue(FollowUp.shouldListenAgain("done", true, turnsDone = 2, pendingRemaining = 0))
    assertFalse(FollowUp.shouldListenAgain("done", true, turnsDone = 3, pendingRemaining = 0))
  }

  @Test
  fun eachQueuedApprovalStretchesTheLimitButNeverPastFive() {
    assertEquals(3, FollowUp.maxTurns(0))
    assertEquals(4, FollowUp.maxTurns(1))
    assertEquals(5, FollowUp.maxTurns(2))
    assertEquals(5, FollowUp.maxTurns(9))
    assertEquals(3, FollowUp.maxTurns(-1))
    assertTrue(FollowUp.shouldListenAgain("done", true, turnsDone = 3, pendingRemaining = 1))
    assertFalse(FollowUp.shouldListenAgain("done", true, turnsDone = 5, pendingRemaining = 9))
  }

  @Test
  fun waitsSixSecondsForSpeech() {
    assertEquals(6_000L, FollowUp.NO_SPEECH_MS)
  }

  @Test
  fun anOutcomeNamingAnApprovalLeavesThatIdPending() {
    val state = FollowUpState.after(
      CommandOutcome(
        "done", "Book?", pendingApprovalId = "oapr_A", pendingKind = "create_appointment",
        pendingQueue = "[{\"id\":\"oapr_B\"}]", pendingRemaining = 1,
      ),
    )
    assertTrue(state.hasPending)
    assertEquals("oapr_A", state.pendingApprovalId)
    assertEquals("create_appointment", state.pendingKind)
    assertEquals("[{\"id\":\"oapr_B\"}]", state.pendingQueue)
    assertEquals(1, state.pendingRemaining)
  }

  @Test
  fun anOutcomeWithNoApprovalClearsThePendingState() {
    assertEquals(FollowUpState.NONE, FollowUpState.after(CommandOutcome("done", "You have 3 bookings.", expectsReply = true)))
    assertFalse(FollowUpState.NONE.hasPending)
  }
}

class SpokenReplyFollowUpTest {
  private fun say(status: String, message: String, spoken: String) =
    SpokenReply.forOutcome(status, message, "Didn't catch that", "speech_unavailable", spoken)

  @Test
  fun speaksTheAppsSpokenTextInFullInsteadOfTheMessage() {
    val spoken = "I can book that. " + "Book Gel overlay for Thandi Ngwenya on Friday 16 October at 20:30 to 21:15? Say yes or no."
    assertEquals(spoken, say("done", "I can book that.", spoken))
  }

  @Test
  fun doesNotCutALongSpokenText() {
    val long = "Sentence one is here. ".repeat(40)
    assertEquals(long.trim(), say("done", "x", long))
  }

  @Test
  fun fallsBackToTheMessageWhenThereIsNoSpokenText() {
    assertEquals("Checked in Sipho", say("done", "Checked in Sipho", ""))
  }

  @Test
  fun anErrorIsNeverReplacedBySpokenText() {
    assertEquals(SpokenReply.NOT_HEARD_SPOKEN, say("error", "Didn't catch that", "anything"))
  }
}
