package expo.modules.clovievoice

/**
 * What the app's JS says about the conversation after a command: an approval was read aloud and a yes or no is
 * awaited, or the reply asked a question. Echoed back to JS with the next turn, unchanged, so a yes or no is bound to
 * the approval that was just read (`pendingApprovalId`), never to "the latest pending".
 */
data class FollowUpState(
  val pendingApprovalId: String = "",
  val pendingKind: String = "",
  /** JSON of the approvals still to read after the pending one. Opaque here. */
  val pendingQueue: String = "",
  val pendingRemaining: Int = 0,
  /** The executed action just read aloud and when its undo window closes (epoch ms): a passive undo-listen window. */
  val pendingActionId: String = "",
  val undoUntilMs: Long = 0L,
) {
  val hasPending: Boolean
    get() = pendingApprovalId.isNotEmpty()

  val hasPendingAction: Boolean
    get() = pendingActionId.isNotEmpty() && undoUntilMs > 0L

  companion object {
    val NONE = FollowUpState()

    /**
     * The conversation state an outcome leaves behind: the pending approval, else the executed action whose undo window
     * is open, else nothing. Never both: an approval is a question, an action is already done.
     */
    fun after(outcome: CommandOutcome): FollowUpState =
      when {
        outcome.pendingApprovalId.isNotEmpty() ->
          FollowUpState(outcome.pendingApprovalId, outcome.pendingKind, outcome.pendingQueue, outcome.pendingRemaining)
        outcome.pendingActionId.isNotEmpty() && outcome.undoUntilMs > 0L ->
          FollowUpState(pendingActionId = outcome.pendingActionId, undoUntilMs = outcome.undoUntilMs)
        else -> NONE
      }
  }
}

/**
 * Pure decisions for listening again after Clovie has spoken, with no wake word: whether to, and how long to wait for
 * speech. At most [BASE_TURNS] follow-up turns per wake so it cannot loop; each approval still queued stretches that by
 * one so several can be read one at a time, never beyond [MAX_TURNS].
 */
object FollowUp {
  const val BASE_TURNS = 3
  const val MAX_TURNS = 5

  /** No speech for this long ends the follow-up quietly. */
  const val NO_SPEECH_MS = 6_000L

  /** Follow-up turns allowed given how many approvals are still queued after the pending one. */
  fun maxTurns(pendingRemaining: Int): Int = minOf(MAX_TURNS, BASE_TURNS + maxOf(0, pendingRemaining))

  /**
   * True when the outcome finished and wants an answer, and `turnsDone` follow-ups have not yet used up the limit.
   * An error listens again only when it asks to (a lost connection mid-conversation); `open_app` and plain
   * statements never do.
   */
  fun shouldListenAgain(status: String, expectsReply: Boolean, turnsDone: Int, pendingRemaining: Int): Boolean =
    (status == "done" || status == "error") && expectsReply && turnsDone < maxTurns(pendingRemaining)
}

/**
 * The passive undo-listen window after an executed action (act-then-undo): the service listens once more, with no
 * wake word, only while the action can still be undone. Pure, so it is unit tested with plain numbers.
 */
object UndoWindow {
  fun remainingMs(nowMs: Long, undoUntilMs: Long): Long = maxOf(0L, undoUntilMs - nowMs)

  fun isOpen(nowMs: Long, undoUntilMs: Long): Boolean = undoUntilMs > nowMs

  /** How long to wait for speech: the usual follow-up wait, but never past the end of the window. */
  fun noSpeechMs(nowMs: Long, undoUntilMs: Long): Long = minOf(FollowUp.NO_SPEECH_MS, remainingMs(nowMs, undoUntilMs))

  /** How long the in-app drawer keeps the Undo button up after the silent follow-up: the rest of the window, capped. */
  fun holdMs(nowMs: Long, undoUntilMs: Long, capMs: Long): Long = minOf(capMs, remainingMs(nowMs, undoUntilMs))
}
