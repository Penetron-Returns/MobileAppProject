/** Attendance check use cases behind /v1/attendance: list the caller's questions and answer one. */
import type { AttendanceCheckDTO, AttendanceOutcome, AttendancePendingResponse } from '@booking/types';
import { AppError, forbidden, notFound, ruleViolation } from '../../lib/errors.ts';
import type { BookingService } from '../../bookings/ports.ts';
import { toAttendanceCheckDTO } from '../lib/dto.ts';
import type { AttendanceCaller, AttendanceCheckRow, AttendanceRepository } from '../ports.ts';

export interface AttendanceAnswerDeps {
  repo: AttendanceRepository;
  booking: Pick<BookingService, 'setAppointmentStatus'>;
  clock: () => Date;
}

/** Whether the caller may answer this question: its recipient, or any owner of the business. */
export function canAnswer(caller: AttendanceCaller, check: AttendanceCheckRow): boolean {
  return caller.role === 'owner' || check.recipient_user_id === caller.userId;
}

/** Owners also see what is addressed to the owner(s): owner mode, or staff mode once escalated. */
function isForCaller(caller: AttendanceCaller, check: AttendanceCheckRow): boolean {
  if (check.recipient_user_id === caller.userId) return true;
  return caller.role === 'owner' && (check.audience === 'owner' || check.escalated_at !== null);
}

export async function listPendingFor(repo: AttendanceRepository, caller: AttendanceCaller): Promise<AttendancePendingResponse> {
  const rows = await repo.listPendingChecksForBusiness(caller.businessId);
  const checks = rows
    .filter((r) => r.appointment_status === 'confirmed' && isForCaller(caller, r))
    .map(toAttendanceCheckDTO);
  return { count: checks.length, checks };
}

export async function answerCheck(
  deps: AttendanceAnswerDeps,
  caller: AttendanceCaller,
  checkId: string,
  outcome: AttendanceOutcome,
): Promise<AttendanceCheckDTO> {
  const { repo, booking, clock } = deps;
  const check = await repo.getCheck(caller.businessId, checkId);
  if (!check) throw notFound('Attendance check');
  if (!canAnswer(caller, check)) throw forbidden('This question is not addressed to you');

  if (check.status === 'answered') {
    // A replay of the same answer is a no-op; a different one must not rewrite history.
    if (check.outcome === outcome) return toAttendanceCheckDTO(check);
    throw ruleViolation('ATTENDANCE_ALREADY_ANSWERED', 'This question was already answered');
  }

  let result: AttendanceOutcome | 'resolved_elsewhere' = outcome;
  if (check.appointment_status !== 'confirmed') {
    result = 'resolved_elsewhere';
  } else {
    try {
      await booking.setAppointmentStatus(
        caller.businessId,
        check.appointment_id,
        outcome === 'came' ? 'completed' : 'no_show',
        { type: 'staff', id: caller.userId },
      );
    } catch (err) {
      // Lost a race with another change to the appointment: just close the question.
      if (!(err instanceof AppError) || err.details?.rule !== 'INVALID_STATUS') throw err;
      result = 'resolved_elsewhere';
    }
  }

  await repo.answerCheck({
    businessId: caller.businessId,
    checkId,
    outcome: result,
    answeredBy: caller.userId,
    at: clock().toISOString(),
  });
  const fresh = await repo.getCheck(caller.businessId, checkId);
  if (!fresh) throw notFound('Attendance check');
  return toAttendanceCheckDTO(fresh);
}
