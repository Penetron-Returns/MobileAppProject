import type {
  AttendanceCheckDTO,
  AttendanceOutcome,
  AttendancePendingResponse,
} from '@booking/types';
import { z } from 'zod';

import { formatTime } from '@/lib/time';

/** One key per (question, answer): replays of the same tap never act twice. */
export function attendanceIdempotencyKey(
  checkId: string,
  outcome: AttendanceOutcome,
): string {
  return `attendance:${checkId}:${outcome}`;
}

const idSchema = z.string().min(1);
const countSchema = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => Number(value));

const pushSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attendance_check'),
    checkId: idSchema,
    appointmentId: idSchema,
  }),
  z.object({ type: z.literal('attendance_batch'), count: countSchema }),
  z.object({ type: z.literal('attendance_summary'), count: countSchema }),
]);

export type ParsedAttendancePush = z.output<typeof pushSchema>;

/** Validates a push `data` payload (all strings); null when it is not an attendance push. */
export function parseAttendancePush(
  data: unknown,
): ParsedAttendancePush | null {
  const parsed = pushSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The values the "Did {{name}} make it to their {{time}} {{service}}?" line needs. */
export function questionValues(check: AttendanceCheckDTO, timezone: string) {
  return {
    name: check.client_first_name,
    service: check.service_name,
    time: formatTime(check.starts_at, timezone),
  };
}

/** The pending list without one question (the optimistic answer). */
export function withoutCheck(
  data: AttendancePendingResponse,
  checkId: string,
): AttendancePendingResponse {
  const checks = data.checks.filter((c) => c.id !== checkId);
  return { count: checks.length, checks };
}
