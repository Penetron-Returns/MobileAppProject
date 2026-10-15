import type { BusinessHoursRow, SpecialDayDTO } from '@booking/types';

import { addDays, toHHmm, weekdayOf, type ISODate } from '@/lib/time';
import { zonedTimeToUtc } from '@/lib/zoned';

/**
 * "On duty": when hands-free ("Hey Clovie") may keep the microphone open. Pure, with the clock and
 * timezone injected. The native side (HandsFreePolicy.kt) mirrors `evaluateDuty` so the service,
 * the alarm and the boot receiver can decide with the app closed.
 */

/** An opening window in epoch ms: [start, end). */
export interface DutyWindow {
  start: number;
  end: number;
}

export interface DutyConditions {
  /** Only inside the business opening hours (special days included). */
  useOpeningHours: boolean;
  /** Only while the phone is charging. Both off means always. */
  onlyWhileCharging: boolean;
}

/** What the owner gets when switching hands-free on. */
export const DEFAULT_CONDITIONS: DutyConditions = {
  useOpeningHours: true,
  onlyWhileCharging: false,
};

/** How many days of windows the app hands to the native side. */
export const WINDOW_DAYS = 14;

export type DutyState =
  'on_duty' | 'off_hours' | 'waiting_charger' | 'paused' | 'stopped';

export interface DutyStatus {
  state: DutyState;
  /** When this state is expected to change (epoch ms), or null when unknown or never. */
  until: number | null;
}

interface WindowsInput {
  hours: readonly BusinessHoursRow[];
  specialDays: readonly Pick<
    SpecialDayDTO,
    'date' | 'is_closed' | 'start_time' | 'end_time'
  >[];
  timezone: string;
  /** First business-local date. */
  from: ISODate;
  days: number;
}

/** A closing time of 00:00 means the midnight that ends the day. */
function rangeOf(
  date: ISODate,
  opens: string,
  closes: string,
  timezone: string,
): DutyWindow | null {
  const start = zonedTimeToUtc(date, toHHmm(opens), timezone).getTime();
  const closeDate = toHHmm(closes) === '00:00' ? addDays(date, 1) : date;
  const end = zonedTimeToUtc(closeDate, toHHmm(closes), timezone).getTime();
  return end > start ? { start, end } : null;
}

/**
 * The opening windows of `days` business-local days from `from`: the weekly hours, replaced on a
 * special day by its own hours, or by nothing when it is a closure or public holiday. Windows that
 * touch or overlap are merged.
 */
export function dutyWindows(input: WindowsInput): DutyWindow[] {
  const found: DutyWindow[] = [];
  for (let i = 0; i < input.days; i++) {
    const date = addDays(input.from, i);
    const special = input.specialDays.find((d) => d.date === date);
    if (special) {
      if (special.is_closed || !special.start_time || !special.end_time) {
        continue;
      }
      const range = rangeOf(
        date,
        special.start_time,
        special.end_time,
        input.timezone,
      );
      if (range) found.push(range);
      continue;
    }
    const weekday = weekdayOf(date);
    for (const row of input.hours) {
      if (row.weekday !== weekday) continue;
      const range = rangeOf(date, row.opens_at, row.closes_at, input.timezone);
      if (range) found.push(range);
    }
  }
  found.sort((a, b) => a.start - b.start);
  const merged: DutyWindow[] = [];
  for (const window of found) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) {
      last.end = Math.max(last.end, window.end);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

export interface DutyInput {
  windows: readonly DutyWindow[];
  conditions: DutyConditions;
  isCharging: boolean;
  /** Epoch ms. */
  now: number;
  /** Paused from the notification until this instant (epoch ms), if any. */
  pausedUntil?: number;
  /** False when hands-free is switched off. */
  isEnabled?: boolean;
}

/** Whether to listen now, and when that changes. */
export function evaluateDuty(input: DutyInput): DutyStatus {
  const { windows, conditions, now } = input;
  if (input.isEnabled === false) return { state: 'stopped', until: null };
  if (input.pausedUntil !== undefined && now < input.pausedUntil) {
    return { state: 'paused', until: input.pausedUntil };
  }
  const current = conditions.useOpeningHours
    ? windows.find((w) => now >= w.start && now < w.end)
    : undefined;
  if (conditions.useOpeningHours && !current) {
    const next = windows.find((w) => w.start > now);
    return { state: 'off_hours', until: next?.start ?? null };
  }
  if (conditions.onlyWhileCharging && !input.isCharging) {
    return { state: 'waiting_charger', until: null };
  }
  return { state: 'on_duty', until: current?.end ?? null };
}

/** The flat [start, end, ...] list the native side stores. */
export function flattenWindows(windows: readonly DutyWindow[]): number[] {
  return windows.flatMap((w) => [w.start, w.end]);
}
