/**
 * Loads everything the pure availability engine needs for a date range. The ONE place the schedule
 * tables (hours, special days, breaks, time off, overrides) become engine input.
 */
import type { ISODate, UUID } from '@booking/types';
import type { AvailabilityInput } from '../../availability/lib/availability.ts';
import { addDays, dayBoundsInZone, rangeBounds } from '../../lib/time.ts';
import type { BusinessRow, StaffRow } from '../../repositories/rows.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import { bookingRules } from './mappers.ts';

export interface AvailabilityContextArgs {
  business: BusinessRow;
  durationMinutes: number;
  staff: StaffRow[];
  from: ISODate;
  to: ISODate;
  now: Date;
  excludeAppointmentId?: UUID;
}

export async function loadAvailabilityInput(
  repo: BookingRepository,
  args: AvailabilityContextArgs,
): Promise<AvailabilityInput> {
  const { business, staff } = args;
  const tz = business.timezone;
  const ids = staff.map((s) => s.id);
  const windowStart = new Date(dayBoundsInZone(args.from, tz).start).toISOString();
  // One extra day covers buffers that spill past midnight.
  const windowEnd = new Date(dayBoundsInZone(addDays(args.to, 1), tz).end).toISOString();
  const [hours, rules, overrides, specialDays, breaks, timeOff, busy] = await Promise.all([
    repo.listBusinessHours(business.id),
    repo.listAvailabilityRules(business.id, ids),
    repo.listOverrides(business.id, args.from, args.to),
    repo.listSpecialDays(business.id, args.from, args.to),
    repo.listStaffBreaks(business.id, ids),
    repo.listTimeOff(business.id, args.from, args.to, ids),
    repo.listBusy(business.id, ids, windowStart, windowEnd),
  ]);
  return {
    timezone: tz,
    rules: bookingRules(business),
    businessHours: hours.map((h) => ({ weekday: h.weekday, start: h.opens_at, end: h.closes_at })),
    specialDays: specialDays.map((d) => ({
      date: d.date,
      is_closed: d.is_closed,
      start_time: d.start_time,
      end_time: d.end_time,
    })),
    overrides: overrides.map((o) => ({
      staff_id: o.staff_id,
      date: o.date,
      is_closed: o.is_closed,
      start_time: o.start_time,
      end_time: o.end_time,
    })),
    staff: staff.map((s) => ({
      id: s.id,
      sort_order: s.sort_order,
      rules: rules
        .filter((r) => r.staff_id === s.id)
        .map((r) => ({ weekday: r.weekday, start: r.start_time, end: r.end_time })),
      breaks: breaks
        .filter((b) => b.staff_id === s.id)
        .map((b) => ({ weekdays: b.weekdays, start: b.start_time, end: b.end_time })),
      timeOff: timeOff
        .filter((t) => t.staff_id === s.id)
        .map((t) => ({ starts_on: t.starts_on, ends_on: t.ends_on, start_time: t.start_time, end_time: t.end_time })),
    })),
    busy: busy
      .filter((b) => b.id !== args.excludeAppointmentId)
      .map((b) => ({ staff_id: b.staff_id, ...rangeBounds(b.blocked) })),
    durationMinutes: args.durationMinutes,
    now: args.now,
  };
}
