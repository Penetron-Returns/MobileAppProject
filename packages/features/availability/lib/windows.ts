/**
 * Bookable wall-clock windows per staff member and date. Pure.
 *
 * Rule order (docs/booking-core.md):
 *   1. business hours (weekday)  2. special day (replaces or closes the date)
 *   3. staff hours (weekday, or the override for that date), clipped to 1+2
 *   4. staff breaks   5. staff time off
 * Appointments, buffer, lead time and horizon are applied afterwards by the slot engine.
 */
import type { ISODate, UUID } from '@booking/types';
import { parseTimeOfDay, weekdayOf } from '../../lib/time.ts';

/** Wall-clock interval in minutes after midnight, [start, end) */
export type MinuteWindow = [number, number];

const DAY_MINUTES = 24 * 60;

export interface WeeklyWindow {
  weekday: number;
  /** `HH:mm` or Postgres `HH:mm:ss` */
  start: string;
  end: string;
}

/** A business-wide closed date or replacement hours (business_special_days). */
export interface SpecialDayWindow {
  date: ISODate;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

/** A per-staff day override (availability_overrides): closed, or replaces that staff member's weekly hours. */
export interface OverrideWindow {
  staff_id: UUID;
  date: ISODate;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
}

/** A recurring break; `weekdays` empty = every day. */
export interface BreakWindow {
  weekdays: number[];
  start: string;
  end: string;
}

/** A staff absence over a date range; both times null = all day on each date, else those hours each date. */
export interface TimeOffWindow {
  starts_on: ISODate;
  ends_on: ISODate;
  start_time: string | null;
  end_time: string | null;
}

export interface StaffSchedule {
  id: UUID;
  sort_order: number;
  /** Zero rules → the staff member inherits business hours */
  rules: WeeklyWindow[];
  breaks: BreakWindow[];
  timeOff: TimeOffWindow[];
}

export interface ScheduleInput {
  businessHours: WeeklyWindow[];
  specialDays: SpecialDayWindow[];
  overrides: OverrideWindow[];
}

// ---------- window algebra (wall-clock minutes) ----------

/** Sorts and merges overlapping or touching windows. */
export function mergeWindows(windows: MinuteWindow[]): MinuteWindow[] {
  const sorted = windows.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: MinuteWindow[] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function intersectWindows(a: MinuteWindow[], b: MinuteWindow[]): MinuteWindow[] {
  const out: MinuteWindow[] = [];
  for (const [as, ae] of a) {
    for (const [bs, be] of b) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (e > s) out.push([s, e]);
    }
  }
  return mergeWindows(out);
}

/** `a` with every part covered by `remove` taken out. */
export function subtractWindows(a: MinuteWindow[], remove: MinuteWindow[]): MinuteWindow[] {
  const cuts = mergeWindows(remove);
  const out: MinuteWindow[] = [];
  for (const [start, end] of mergeWindows(a)) {
    let cursor = start;
    for (const [cs, ce] of cuts) {
      if (ce <= cursor || cs >= end) continue;
      if (cs > cursor) out.push([cursor, cs]);
      cursor = Math.max(cursor, ce);
    }
    if (cursor < end) out.push([cursor, end]);
  }
  return out;
}

// ---------- per-layer windows ----------

function weeklyWindows(rows: WeeklyWindow[], weekday: number): MinuteWindow[] {
  return mergeWindows(
    rows.filter((r) => r.weekday === weekday).map((r) => [parseTimeOfDay(r.start), parseTimeOfDay(r.end)]),
  );
}

function windowOf(start: string | null, end: string | null): MinuteWindow[] {
  return start && end ? [[parseTimeOfDay(start), parseTimeOfDay(end)]] : [];
}

/** Business windows for a date: its special day (closed → none, else the replacement hours), else the weekday's hours. */
export function businessWindowsFor(input: Pick<ScheduleInput, 'businessHours' | 'specialDays'>, date: ISODate): MinuteWindow[] {
  const special = input.specialDays.filter((d) => d.date === date);
  if (special.length === 0) return weeklyWindows(input.businessHours, weekdayOf(date));
  if (special.some((d) => d.is_closed)) return [];
  return mergeWindows(special.flatMap((d) => windowOf(d.start_time, d.end_time)));
}

/** Override rows of one staff member on one date: null = none, [] = closed, else the replacement windows. */
function overrideWindows(overrides: OverrideWindow[], staffId: UUID, date: ISODate): MinuteWindow[] | null {
  const rows = overrides.filter((o) => o.staff_id === staffId && o.date === date);
  if (rows.length === 0) return null;
  if (rows.some((o) => o.is_closed)) return [];
  return mergeWindows(rows.flatMap((o) => windowOf(o.start_time, o.end_time)));
}

function breakWindows(breaks: BreakWindow[], weekday: number): MinuteWindow[] {
  return breaks
    .filter((b) => b.weekdays.length === 0 || b.weekdays.includes(weekday))
    .map((b): MinuteWindow => [parseTimeOfDay(b.start), parseTimeOfDay(b.end)]);
}

function timeOffWindows(timeOff: TimeOffWindow[], date: ISODate): MinuteWindow[] {
  return timeOff
    .filter((t) => t.starts_on <= date && date <= t.ends_on)
    .map((t): MinuteWindow => (t.start_time && t.end_time ? [parseTimeOfDay(t.start_time), parseTimeOfDay(t.end_time)] : [0, DAY_MINUTES]));
}

/**
 * Bookable windows of one staff member on a date: (staff override | staff weekly hours | business windows),
 * clipped to the business windows (which already reflect special days), minus breaks and time off.
 */
export function staffWindowsFor(input: ScheduleInput, staff: StaffSchedule, date: ISODate): MinuteWindow[] {
  const business = businessWindowsFor(input, date);
  const weekday = weekdayOf(date);
  const own =
    overrideWindows(input.overrides, staff.id, date) ??
    (staff.rules.length === 0 ? business : weeklyWindows(staff.rules, weekday));
  const working = intersectWindows(own, business);
  return subtractWindows(working, [...breakWindows(staff.breaks, weekday), ...timeOffWindows(staff.timeOff, date)]);
}
