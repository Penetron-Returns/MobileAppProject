/**
 * Free time: per staff member, the maximal disjoint instant windows inside [start, end) where they work and
 * have no appointment/block. Pure: the schedule layers come from staffWindowsFor (the same function the slot
 * engine uses) and busy ranges are the same `blocked` ranges that reject slots, so every slot lies inside a
 * free window by construction.
 *
 * Buffer decision: busy ranges are the appointments' `blocked` ranges (already including their own buffer),
 * so a free window is never shortened further. A slot needs [t, t+duration+buffer) clear of busy, which
 * implies [t, t+duration) is clear, so slots stay a subset of free time. Free time is the raw schedule: it
 * ignores lead time, horizon, slot grid and service duration.
 */
import type { ISODate, UUID } from '@booking/types';
import { dateInZone, dateRange, wallClockToEpoch } from '../../lib/time.ts';
import type { BusyRange } from './availability.ts';
import { mergeWindows, staffWindowsFor, subtractWindows, type MinuteWindow, type ScheduleInput, type StaffSchedule } from './windows.ts';

const MINUTE = 60_000;

export interface FreeTimeInput extends ScheduleInput {
  timezone: string;
  staff: StaffSchedule[];
  busy: BusyRange[];
}

export interface FreeTimeQuery {
  /** Inclusive instant (ISO 8601) */
  start: string;
  /** Exclusive instant (ISO 8601) */
  end: string;
  /** Windows shorter than this many minutes are dropped */
  minimumMinutes: number;
}

export interface FreeWindow {
  starts_at: string;
  ends_at: string;
}

export interface StaffFreeTime {
  staff_id: UUID;
  windows: FreeWindow[];
}

/** One entry per staff in `input.staff` (input order), windows sorted, disjoint and clipped to [start, end). */
export function computeFreeTime(input: FreeTimeInput, query: FreeTimeQuery): StaffFreeTime[] {
  const start = Date.parse(query.start);
  const end = Date.parse(query.end);
  const minimum = Math.max(0, query.minimumMinutes) * MINUTE;
  const dates = end > start ? dateRange(dateInZone(new Date(start), input.timezone), dateInZone(new Date(end - 1), input.timezone)) : [];
  return input.staff.map((staff) => {
    const busy = mergeWindows(
      input.busy.filter((b) => b.staff_id === staff.id).map((b): MinuteWindow => [Date.parse(b.start), Date.parse(b.end)]),
    );
    const working = mergeWindows(dates.flatMap((date) => workingEpochWindows(input, staff, date)));
    const windows = subtractWindows(working, busy)
      .map(([s, e]): MinuteWindow => [Math.max(s, start), Math.min(e, end)])
      .filter(([s, e]) => e > s && e - s >= minimum)
      .map(([s, e]) => ({ starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() }));
    return { staff_id: staff.id, windows };
  });
}

function workingEpochWindows(input: FreeTimeInput, staff: StaffSchedule, date: ISODate): MinuteWindow[] {
  return staffWindowsFor(input, staff, date).map(
    ([s, e]): MinuteWindow => [wallClockToEpoch(date, s, input.timezone), wallClockToEpoch(date, e, input.timezone)],
  );
}
