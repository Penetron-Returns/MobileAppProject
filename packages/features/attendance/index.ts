/**
 * Attendance check entry point: AttendanceService over the Supabase repository
 * (see docs/BUILD_PLAN.md "Attendance check").
 */
import type { Db } from '../lib/db.ts';
import { createLogger, type Logger } from '../lib/logger.ts';
import type { BookingService } from '../bookings/ports.ts';
import type { AttendancePush, AttendanceRepository, AttendanceService } from './ports.ts';
import { createSupabaseAttendanceRepository } from './repositories/supabase.ts';
import { runAttendanceJob } from './services/attendanceJob.ts';
import { answerCheck, listPendingFor } from './services/attendanceService.ts';

export interface AttendanceDeps {
  repo: AttendanceRepository;
  booking: Pick<BookingService, 'setAppointmentStatus'>;
  push: AttendancePush;
  clock: () => Date;
  logger?: Logger;
  newId?: () => string;
}

export function createAttendanceServiceFromRepository(deps: AttendanceDeps): AttendanceService {
  const logger = deps.logger ?? createLogger({ module: 'attendance' });
  const newId = deps.newId ?? (() => crypto.randomUUID());
  return {
    listPending: (caller) => listPendingFor(deps.repo, caller),
    answer: (caller, checkId, outcome) => answerCheck(deps, caller, checkId, outcome),
    runJob: (now) => runAttendanceJob({ repo: deps.repo, booking: deps.booking, push: deps.push, logger, newId }, now ?? deps.clock()),
  };
}

export function createAttendanceService(deps: Omit<AttendanceDeps, 'repo'> & { db: Db }): AttendanceService {
  return createAttendanceServiceFromRepository({ ...deps, repo: createSupabaseAttendanceRepository(deps.db) });
}

export { createSupabaseAttendanceRepository } from './repositories/supabase.ts';
