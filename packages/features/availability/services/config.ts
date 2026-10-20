/**
 * Read side of the hours and availability screens: the whole configuration for a date range in one call, and
 * the preview of existing appointments a proposed special day or time off would overlap.
 */
import type { AppointmentDTO, AvailabilityConfigResponse, ISODate, UUID } from '@booking/types';
import { notFound } from '../../lib/errors.ts';
import { addDays, dayBoundsInZone, normaliseTimeOfDay } from '../../lib/time.ts';
import { toAppointmentDTO, toBusinessHours } from '../../bookings/lib/mappers.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import { findConflicts, type ConflictMode } from '../lib/conflicts.ts';
import { toSpecialDayDTO, toStaffBreakDTO, toStaffDayOverrideDTO, toStaffTimeOffDTO } from '../lib/mappers.ts';

const PAGE = 500;

export async function getAvailabilityConfig(
  repo: BookingRepository,
  businessId: UUID,
  range: { from: ISODate; to: ISODate },
): Promise<AvailabilityConfigResponse> {
  const business = await repo.getBusiness(businessId);
  if (!business) throw notFound('Business');
  const staff = await repo.listStaff(businessId);
  const ids = staff.map((s) => s.id);
  const [hours, specialDays, rules, breaks, timeOff, overrides] = await Promise.all([
    repo.listBusinessHours(businessId),
    repo.listSpecialDays(businessId, range.from, range.to),
    repo.listAvailabilityRules(businessId, ids),
    repo.listStaffBreaks(businessId, ids),
    repo.listTimeOff(businessId, range.from, range.to, ids),
    repo.listOverrides(businessId, range.from, range.to),
  ]);
  return {
    from: range.from,
    to: range.to,
    timezone: business.timezone,
    business_hours: hours.map(toBusinessHours),
    special_days: specialDays.map(toSpecialDayDTO),
    staff: staff.map((s) => ({
      staff_id: s.id,
      rules: rules
        .filter((r) => r.staff_id === s.id)
        .sort((a, b) => a.weekday - b.weekday)
        .map((r) => ({ weekday: r.weekday, start_time: normaliseTimeOfDay(r.start_time), end_time: normaliseTimeOfDay(r.end_time) })),
      breaks: breaks.filter((b) => b.staff_id === s.id).map(toStaffBreakDTO),
      time_off: timeOff.filter((t) => t.staff_id === s.id).map(toStaffTimeOffDTO),
      overrides: overrides.filter((o) => o.staff_id === s.id).map(toStaffDayOverrideDTO),
    })),
  };
}

export interface ConflictQuery {
  /** Omitted = every staff member (a special day) */
  staffId?: UUID | null;
  from: ISODate;
  to: ISODate;
  startTime?: string | null;
  endTime?: string | null;
  mode: ConflictMode;
}

/** Confirmed appointments overlapping the proposal. Read-only: nothing is cancelled or moved. */
export async function getAvailabilityConflicts(
  repo: BookingRepository,
  businessId: UUID,
  query: ConflictQuery,
): Promise<AppointmentDTO[]> {
  const business = await repo.getBusiness(businessId);
  if (!business) throw notFound('Business');
  if (query.staffId && !(await repo.getStaff(businessId, query.staffId))) throw notFound('Staff');
  const tz = business.timezone;
  // One day of slack each side catches appointments that start the evening before and run past midnight.
  const fromIso = new Date(dayBoundsInZone(addDays(query.from, -1), tz).start).toISOString();
  const toIso = new Date(dayBoundsInZone(addDays(query.to, 1), tz).end).toISOString();

  const rows = [];
  for (let after: { startsAt: string; id: UUID } | undefined; ; ) {
    const page = await repo.listAppointmentsInWindow(businessId, {
      fromIso,
      toIso,
      staffId: query.staffId ?? undefined,
      status: 'confirmed',
      after,
      limit: PAGE,
    });
    rows.push(...page);
    const last = page[page.length - 1];
    if (!last || page.length < PAGE) break;
    after = { startsAt: toAppointmentDTO(last).starts_at, id: last.id };
  }
  return findConflicts(
    rows.map(toAppointmentDTO),
    { from: query.from, to: query.to, startTime: query.startTime ?? null, endTime: query.endTime ?? null, mode: query.mode },
    tz,
    query.staffId,
  );
}
