/**
 * Port for the Nerova companion chat API (native session headers). Implementations throw `AppError` only and never
 * put the session secret, the message or the reply in a message or detail. The fetch implementation is `httpChatClient.ts`.
 */
import type { ChatAction, ChatTurn } from './chatStream.ts';

/** A native companion session: both values are secrets. */
export interface CompanionChatSession {
  sessionId: string;
  state: string;
}

export type ApprovalDecision = 'approve' | 'decline';

export interface ApprovalOutcome {
  /** The approval's kind when Nerova echoes it, else null */
  kind: string | null;
}

export interface CompanionChatClient {
  /**
   * Runs one turn. Throws `UPSTREAM_COMPANION_ERROR` with `details.nerova_code` (`companion.session_expired`,
   * `companion.session_invalid`, `companion.turn_failed`, ...), `COMPANION_NOT_READY`, `RATE_LIMITED` or `VALIDATION_FAILED`.
   * An `error` event inside the stream is thrown the same way.
   */
  chat(session: CompanionChatSession, message: string): Promise<ChatTurn>;
  /** Approve or decline exactly this approval id. Repeating it returns the stored outcome. */
  decide(session: CompanionChatSession, approvalId: string, decision: ApprovalDecision, idempotencyKey: string): Promise<ApprovalOutcome>;
  /**
   * Undoes one executed action (`POST /v1/companion/actions/{id}/undo`) and returns it (status `undone`). Throws NOT_FOUND
   * (`action.not_found`), RULE_VIOLATION with `details.reason` (`action.undo_window_closed`, `action.not_undoable`,
   * `action.undo_failed`) or a retryable UPSTREAM_COMPANION_ERROR (`action.connector_unavailable`, `details.retryable`).
   */
  undoAction(session: CompanionChatSession, actionId: string, idempotencyKey: string): Promise<ChatAction>;
  /** `GET /v1/companion/actions?status=...`: the owner's recent actions, newest first */
  listActions(session: CompanionChatSession, status: 'executed' | 'undone'): Promise<ChatAction[]>;
}
