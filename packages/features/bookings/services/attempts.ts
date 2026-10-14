/**
 * booking_attempts instrumentation for the web comparator channel (FR21).
 * Lifecycle: start → steps (append {step, at}, step_count+1) → completed
 * (completed_at, appointment_id) or failed (error_code). A failed attempt
 * stays open so the customer can retry; completed/abandoned are final.
 */
import type { UUID } from '@booking/types';
import { AppError, notFound, ruleViolation } from '../../lib/errors.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import type { BookingAttemptRow } from '../../repositories/rows.ts';

export const MAX_ATTEMPT_STEPS = 200;

const isOpen = (a: BookingAttemptRow) => a.outcome === 'in_progress' || a.outcome === 'failed';

export async function startWebAttempt(repo: BookingRepository, businessId: UUID, sessionKey: string | null) {
  const row = await repo.insertAttempt({ business_id: businessId, channel: 'web', session_key: sessionKey });
  return { attempt_id: row.id };
}

/** Loads an open web attempt; `businessId` (when known) must match. */
export async function requireOpenWebAttempt(
  repo: BookingRepository,
  attemptId: UUID,
  businessId?: UUID,
): Promise<BookingAttemptRow> {
  const row = await repo.getAttempt(attemptId);
  if (!row || row.channel !== 'web' || (businessId && row.business_id !== businessId)) throw notFound('Attempt');
  if (!isOpen(row)) throw ruleViolation('ATTEMPT_CLOSED', 'This booking attempt has already finished');
  return row;
}

export async function recordWebStep(repo: BookingRepository, attemptId: UUID, step: string, now: Date) {
  const row = await requireOpenWebAttempt(repo, attemptId);
  if (row.steps.length >= MAX_ATTEMPT_STEPS) {
    throw ruleViolation('ATTEMPT_STEP_LIMIT', 'Too many steps recorded for this attempt');
  }
  const updated = await repo.updateAttempt(row.business_id, row.id, {
    steps: [...row.steps, { step, at: now.toISOString() }],
    step_count: row.step_count + 1,
  });
  return { attempt_id: updated.id, step_count: updated.step_count };
}

export async function completeAttempt(
  repo: BookingRepository,
  attempt: BookingAttemptRow,
  result: { appointmentId: UUID; clientId: UUID },
  now: Date,
) {
  await repo.updateAttempt(attempt.business_id, attempt.id, {
    outcome: 'completed',
    completed_at: now.toISOString(),
    appointment_id: result.appointmentId,
    client_id: result.clientId,
    error_code: null,
  });
}

/** Error code recorded for a failed attempt: the rule for RULE_VIOLATION, else the API code. */
export function attemptErrorCode(err: unknown): string {
  if (!(err instanceof AppError)) return 'INTERNAL';
  const rule = err.details?.rule;
  return typeof rule === 'string' ? rule : err.code;
}

export async function failAttempt(repo: BookingRepository, attempt: BookingAttemptRow, err: unknown) {
  await repo.updateAttempt(attempt.business_id, attempt.id, { outcome: 'failed', error_code: attemptErrorCode(err) });
}
