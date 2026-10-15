/**
 * Staff breaks and time off. Both are removed from a staff member's bookable time by the availability
 * engine (docs/booking-core.md). Every function verifies the staff member or row belongs to the business.
 */
import type {
  CreateStaffTimeOffRequest,
  ReplaceStaffBreaksRequest,
  ReplaceStaffBreaksResponse,
  StaffTimeOffDTO,
  UpdateStaffTimeOffRequest,
  UUID,
} from '@booking/types';
import { AppError, notFound } from '../../lib/errors.ts';
import { diffDays, normaliseTimeOfDay, parseTimeOfDay } from '../../lib/time.ts';
import type { BookingRepository, StaffBreakValues, TimeOffValues } from '../../repositories/types.ts';
import { toStaffBreakDTO, toStaffTimeOffDTO } from '../lib/mappers.ts';

const MAX_TIME_OFF_DAYS = 366;
const invalid = (message: string) => new AppError('VALIDATION_FAILED', message);

async function requireStaff(repo: BookingRepository, businessId: UUID, staffId: UUID) {
  if (!(await repo.getStaff(businessId, staffId))) throw notFound('Staff');
}

/** Atomic replace of one staff member's breaks (`[]` clears). Overlapping breaks fail with RULE_VIOLATION. */
export async function replaceStaffBreaks(
  repo: BookingRepository,
  businessId: UUID,
  staffId: UUID,
  req: ReplaceStaffBreaksRequest,
): Promise<ReplaceStaffBreaksResponse> {
  await requireStaff(repo, businessId, staffId);
  const values: StaffBreakValues[] = req.breaks.map((b) => ({
    label: b.label?.trim() || 'Break',
    start_time: normaliseTimeOfDay(b.start_time),
    end_time: normaliseTimeOfDay(b.end_time),
    weekdays: [...new Set(b.weekdays ?? [])].sort((x, y) => x - y),
  }));
  const rows = await repo.replaceStaffBreaks(businessId, staffId, values);
  return { staff_id: staffId, breaks: rows.map(toStaffBreakDTO) };
}

/** Defaults `ends_on` to `starts_on` and checks the range and the all-day / partial rule. */
export function resolveTimeOff(req: CreateStaffTimeOffRequest): TimeOffValues {
  const endsOn = req.ends_on ?? req.starts_on;
  if (endsOn < req.starts_on) throw invalid('ends_on must not be before starts_on');
  if (diffDays(req.starts_on, endsOn) > MAX_TIME_OFF_DAYS) throw invalid(`Time off is at most ${MAX_TIME_OFF_DAYS} days`);
  const hasStart = !!req.start_time;
  if (hasStart !== !!req.end_time) throw invalid('start_time and end_time must be set together');
  if (hasStart && parseTimeOfDay(req.end_time!) <= parseTimeOfDay(req.start_time!)) {
    throw invalid('end_time must be after start_time');
  }
  return {
    starts_on: req.starts_on,
    ends_on: endsOn,
    // Partial time off: the same hours apply on EACH date of a multi-day range
    start_time: hasStart ? normaliseTimeOfDay(req.start_time!) : null,
    end_time: hasStart ? normaliseTimeOfDay(req.end_time!) : null,
    reason: req.reason ?? 'other',
    note: req.note?.trim() || null,
  };
}

export async function createStaffTimeOff(
  repo: BookingRepository,
  businessId: UUID,
  staffId: UUID,
  req: CreateStaffTimeOffRequest,
): Promise<StaffTimeOffDTO> {
  await requireStaff(repo, businessId, staffId);
  return toStaffTimeOffDTO(await repo.insertTimeOff(businessId, staffId, resolveTimeOff(req)));
}

/** The merged result is validated like a create. Sending `start_time: null, end_time: null` makes it all-day. */
export async function updateStaffTimeOff(
  repo: BookingRepository,
  businessId: UUID,
  timeOffId: UUID,
  req: UpdateStaffTimeOffRequest,
): Promise<StaffTimeOffDTO> {
  const current = await repo.getTimeOff(businessId, timeOffId);
  if (!current) throw notFound('Time off');
  const values = resolveTimeOff({
    starts_on: req.starts_on ?? current.starts_on,
    ends_on: req.ends_on ?? current.ends_on,
    start_time: req.start_time !== undefined ? req.start_time : current.start_time,
    end_time: req.end_time !== undefined ? req.end_time : current.end_time,
    reason: req.reason ?? current.reason,
    note: req.note !== undefined ? req.note : current.note,
  });
  const row = await repo.updateTimeOff(businessId, timeOffId, values);
  if (!row) throw notFound('Time off');
  return toStaffTimeOffDTO(row);
}

export async function deleteStaffTimeOff(repo: BookingRepository, businessId: UUID, timeOffId: UUID): Promise<{ id: UUID }> {
  if (!(await repo.deleteTimeOff(businessId, timeOffId))) throw notFound('Time off');
  return { id: timeOffId };
}
