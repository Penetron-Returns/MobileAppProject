package expo.modules.clovievoice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UndoWindowTest {
  private val now = 1_000_000L

  @Test
  fun theWindowIsOpenOnlyBeforeItsEnd() {
    assertTrue(UndoWindow.isOpen(now, now + 1))
    assertFalse(UndoWindow.isOpen(now, now))
    assertFalse(UndoWindow.isOpen(now, now - 5_000))
    assertFalse(UndoWindow.isOpen(now, 0L))
  }

  @Test
  fun remainingNeverGoesBelowZero() {
    assertEquals(25_000L, UndoWindow.remainingMs(now, now + 25_000))
    assertEquals(0L, UndoWindow.remainingMs(now, now - 1))
  }

  @Test
  fun speechIsWaitedForNoLongerThanTheWindowLasts() {
    assertEquals(FollowUp.NO_SPEECH_MS, UndoWindow.noSpeechMs(now, now + 25_000))
    assertEquals(2_500L, UndoWindow.noSpeechMs(now, now + 2_500))
    assertEquals(0L, UndoWindow.noSpeechMs(now, now - 10))
  }

  @Test
  fun theDrawerHoldsTheUndoButtonForTheRestOfTheWindowButNotBeyondTheCap() {
    assertEquals(20_000L, UndoWindow.holdMs(now, now + 20_000, 120_000L))
    assertEquals(120_000L, UndoWindow.holdMs(now, now + 600_000, 120_000L))
    assertEquals(0L, UndoWindow.holdMs(now, now - 1, 120_000L))
  }

  @Test
  fun anExecutedActionLeavesItsIdAndWindowPending() {
    val state = FollowUpState.after(
      CommandOutcome("done", "Done.", expectsReply = true, pendingActionId = "oact_A", undoUntilMs = now + 30_000),
    )
    assertTrue(state.hasPendingAction)
    assertFalse(state.hasPending)
    assertEquals("oact_A", state.pendingActionId)
    assertEquals(now + 30_000, state.undoUntilMs)
  }

  @Test
  fun anActionWithoutAWindowOrAnIdIsNotPending() {
    assertEquals(FollowUpState.NONE, FollowUpState.after(CommandOutcome("done", "x", pendingActionId = "oact_A")))
    assertEquals(FollowUpState.NONE, FollowUpState.after(CommandOutcome("done", "x", undoUntilMs = now + 1)))
  }

  @Test
  fun anApprovalWinsOverAnActionAndTheActionIsDropped() {
    val state = FollowUpState.after(
      CommandOutcome("done", "x", pendingApprovalId = "oapr_B", pendingActionId = "oact_A", undoUntilMs = now + 1),
    )
    assertTrue(state.hasPending)
    assertFalse(state.hasPendingAction)
  }

  @Test
  fun aPlainOutcomeAfterTheUndoClearsTheWindow() {
    assertEquals(FollowUpState.NONE, FollowUpState.after(CommandOutcome("done", "Okay, undone.")))
  }
}
