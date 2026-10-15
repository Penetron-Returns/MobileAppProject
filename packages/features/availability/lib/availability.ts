/**
 * Availability engine. Pure and deterministic: no I/O, no hidden clock
 * (`now` is part of the input). Windows per staff member and date come from
 * ./windows.ts; this file turns them into slots. See docs/booking-core.md.
 */
import type { ISODate, SlotDTO, UUID } from '@booking/types';
import { dateInZone, dateRange, wallClockToEpoch, addDays } from '../../lib/time.ts';
import { staffWindowsFor, type MinuteWindow, type ScheduleInput, type StaffSchedule } from './windows.ts';

export {
  businessWindowsFor,
  intersectWindows,
  mergeWindows,
  staffWindowsFor,
  subtractWindows,
  type BreakWindow,
  type MinuteWindow,
  type OverrideWindow,
  type SpecialDayWindow,
  type StaffSchedule,
  type TimeOffWindow,
  type WeeklyWindow,
} from './windows.ts';

const MINUTE = 60_000;

/** An existing non-cancelled appointment's `blocked` range. */
export interface BusyRange {
  staff_id: UUID;
  /** ISO instants; `start` is the appointment start (lower(blocked) = lower(slot)) */
  start: string;
  end: string;
}

export interface EngineRules {
  lead_time_minutes: number;
  buffer_minutes: number;
  slot_interval_minutes: number;
  booking_horizon_days: number;
}

export interface AvailabilityInput extends ScheduleInput {
  timezone: string;
  rules: EngineRules;
  /** Candidate staff: already filtered to active, bookable and qualified */
  staff: StaffSchedule[];
  busy: BusyRange[];
  durationMinutes: number;
  now: Date;
}

/** Instant interval in epoch ms, [start, end) */
type EpochWindow = [number, number];

// ---------- dates ----------

/** First and last bookable dates: today … today + booking_horizon_days (business timezone). */
export function bookableDateRange(input: Pick<AvailabilityInput, 'timezone' | 'rules' | 'now'>): {
  first: ISODate;
  last: ISODate;
} {
  const first = dateInZone(input.now, input.timezone);
  return { first, last: addDays(first, Math.max(0, input.rules.booking_horizon_days)) };
}

// ---------- busy ranges & tie-break ----------

interface BusyIndex {
  ranges: Map<UUID, EpochWindow[]>;
  /** staff id → date → appointment count (by appointment start date) */
  counts: Map<UUID, Map<ISODate, number>>;
}

function indexBusy(busy: BusyRange[], timezone: string): BusyIndex {
  const ranges = new Map<UUID, EpochWindow[]>();
  const counts = new Map<UUID, Map<ISODate, number>>();
  for (const b of busy) {
    const start = Date.parse(b.start);
    const end = Date.parse(b.end);
    if (!ranges.has(b.staff_id)) ranges.set(b.staff_id, []);
    ranges.get(b.staff_id)!.push([start, end]);
    const day = dateInZone(new Date(start), timezone);
    if (!counts.has(b.staff_id)) counts.set(b.staff_id, new Map());
    const perDay = counts.get(b.staff_id)!;
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return { ranges, counts };
}

function overlapsBusy(index: BusyIndex, staffId: UUID, start: number, end: number): boolean {
  const ranges = index.ranges.get(staffId);
  return !!ranges && ranges.some(([bs, be]) => start < be && bs < end);
}

/**
 * Deterministic tie-break: fewest appointments that day, then sort_order, then id.
 */
function tieBreak(staff: StaffSchedule[], index: BusyIndex, date: ISODate) {
  const count = (id: UUID) => index.counts.get(id)?.get(date) ?? 0;
  const order = new Map(staff.map((s) => [s.id, s]));
  return (a: UUID, b: UUID): number => {
    const sa = order.get(a)!;
    const sb = order.get(b)!;
    return count(a) - count(b) || sa.sort_order - sb.sort_order || (a < b ? -1 : a > b ? 1 : 0);
  };
}

// ---------- slots ----------

function toEpochWindows(windows: MinuteWindow[], date: ISODate, timezone: string): EpochWindow[] {
  return windows
    .map(([s, e]): EpochWindow => [wallClockToEpoch(date, s, timezone), wallClockToEpoch(date, e, timezone)])
    .filter(([s, e]) => e > s);
}

/**
 * Slots for one calendar date (business timezone), merged across staff and
 * sorted by start. Each slot lists the staff free for it in tie-break order.
 */
export function computeSlots(input: AvailabilityInput, date: ISODate): SlotDTO[] {
  return computeSlotsIndexed(input, date, indexBusy(input.busy, input.timezone));
}

function computeSlotsIndexed(input: AvailabilityInput, date: ISODate, index: BusyIndex): SlotDTO[] {
  const { rules, timezone } = input;
  const { first, last } = bookableDateRange(input);
  if (date < first || date > last || input.durationMinutes <= 0) return [];

  const interval = Math.max(1, rules.slot_interval_minutes) * MINUTE;
  const duration = input.durationMinutes * MINUTE;
  const blockedLength = duration + Math.max(0, rules.buffer_minutes) * MINUTE;
  const earliest = input.now.getTime() + Math.max(0, rules.lead_time_minutes) * MINUTE;

  const byStart = new Map<number, UUID[]>();
  for (const staff of input.staff) {
    for (const [ws, we] of toEpochWindows(staffWindowsFor(input, staff, date), date, timezone)) {
      // Step in elapsed time from the window start (DST-safe: no duplicate or skipped instants).
      for (let t = ws; t + duration <= we; t += interval) {
        if (t < earliest) continue;
        if (overlapsBusy(index, staff.id, t, t + blockedLength)) continue;
        if (!byStart.has(t)) byStart.set(t, []);
        byStart.get(t)!.push(staff.id);
      }
    }
  }

  const compare = tieBreak(input.staff, index, date);
  return [...byStart.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, ids]) => ({
      starts_at: new Date(t).toISOString(),
      ends_at: new Date(t + duration).toISOString(),
      staff_ids: [...new Set(ids)].sort(compare),
    }));
}

/** Dates in [from, to] (clipped to the bookable range) that have at least one slot. */
export function listAvailableDays(input: AvailabilityInput, from: ISODate, to: ISODate): ISODate[] {
  const { first, last } = bookableDateRange(input);
  const start = from < first ? first : from;
  const end = to > last ? last : to;
  const index = indexBusy(input.busy, input.timezone);
  return dateRange(start, end).filter((d) => computeSlotsIndexed(input, d, index).length > 0);
}

/** The slot starting exactly at `startsAt` (must be aligned to the grid), or null. */
export function findSlot(input: AvailabilityInput, startsAt: string): SlotDTO | null {
  const target = Date.parse(startsAt);
  const date = dateInZone(new Date(target), input.timezone);
  return computeSlots(input, date).find((s) => Date.parse(s.starts_at) === target) ?? null;
}

/**
 * Staff (from `input.staff`) with no busy overlap for [startsAt, +duration+buffer),
 * ignoring hours, lead time and horizon. Used for staff walk-ins
 * (`allowOutsideHours`), ordered by the same tie-break.
 */
export function freeStaffIgnoringHours(input: AvailabilityInput, startsAt: string): UUID[] {
  const index = indexBusy(input.busy, input.timezone);
  const start = Date.parse(startsAt);
  const end = start + (input.durationMinutes + Math.max(0, input.rules.buffer_minutes)) * MINUTE;
  const date = dateInZone(new Date(start), input.timezone);
  return input.staff
    .map((s) => s.id)
    .filter((id) => !overlapsBusy(index, id, start, end))
    .sort(tieBreak(input.staff, index, date));
}
