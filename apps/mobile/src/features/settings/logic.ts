import type { BusinessHoursRow } from '@shared/api';

import { minutesToTime, timeToMinutes, toHHmm } from '@/lib/time';

/** Display order of the week in settings: Monday first, Sunday last. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export interface TimeRange {
  opens: string;
  closes: string;
}

export interface DayHours {
  weekday: number;
  isOpen: boolean;
  ranges: TimeRange[];
}

const DEFAULT_RANGE: TimeRange = { opens: '09:00', closes: '17:00' };

export function toWeekSchedule(
  rows: { weekday: number; opens_at: string; closes_at: string }[],
): DayHours[] {
  return WEEK_ORDER.map((weekday) => {
    const ranges = rows
      .filter((r) => r.weekday === weekday)
      .map((r) => ({ opens: toHHmm(r.opens_at), closes: toHHmm(r.closes_at) }))
      .sort((a, b) => a.opens.localeCompare(b.opens));
    return {
      weekday,
      isOpen: ranges.length > 0,
      ranges: ranges.length ? ranges : [DEFAULT_RANGE],
    };
  });
}

export function toHoursRows(days: DayHours[]): BusinessHoursRow[] {
  return days.flatMap((day) =>
    day.isOpen
      ? day.ranges.map((r) => ({
          weekday: day.weekday,
          opens_at: r.opens,
          closes_at: r.closes,
        }))
      : [],
  );
}

export type HoursError = { weekday: number; reason: 'order' | 'overlap' };

/** Every range must end after it starts, and a day's ranges must not overlap. */
export function validateWeek(days: DayHours[]): HoursError | null {
  for (const day of days) {
    if (!day.isOpen) continue;
    const sorted = [...day.ranges].sort((a, b) =>
      a.opens.localeCompare(b.opens),
    );
    for (let i = 0; i < sorted.length; i += 1) {
      if (timeToMinutes(sorted[i].closes) <= timeToMinutes(sorted[i].opens)) {
        return { weekday: day.weekday, reason: 'order' };
      }
      if (
        i > 0 &&
        timeToMinutes(sorted[i].opens) < timeToMinutes(sorted[i - 1].closes)
      ) {
        return { weekday: day.weekday, reason: 'overlap' };
      }
    }
  }
  return null;
}

/** A new range starting an hour after the day's last one closes. */
export function nextRange(ranges: TimeRange[]): TimeRange {
  const last = ranges[ranges.length - 1];
  if (!last) return DEFAULT_RANGE;
  const start = Math.min(timeToMinutes(last.closes) + 60, 22 * 60);
  return {
    opens: minutesToTime(start),
    closes: minutesToTime(Math.min(start + 120, 23 * 60 + 30)),
  };
}

/** Half-hour options for time pickers, 05:00–23:30. */
export const TIME_OPTIONS = Array.from({ length: 38 }, (_, i) =>
  minutesToTime(5 * 60 + i * 30),
);
