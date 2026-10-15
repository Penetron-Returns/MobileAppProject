import type {
  BookingsBySourceDTO,
  BusiestSlotDTO,
  MonthKey,
  WeeklyJobsDTO,
} from '@booking/types';

import {
  addDays,
  formatDayMonth,
  MONTHS,
  WEEKDAYS,
  type ISODate,
} from '@/lib/time';

/** `YYYY-MM` of a business-timezone date. */
export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

/** The month `delta` months from `month` (negative = earlier). */
export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mm = (index % 12) + 1;
  return `${year}-${String(mm).padStart(2, '0')}`;
}

/** "October 2026" */
export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Reports never look into the future: the switcher stops at the current month. */
export function canGoNext(month: MonthKey, currentMonth: MonthKey): boolean {
  return month < currentMonth;
}

/**
 * The top of the chart axis: the smallest "round" number (1, 2 or 5 times a
 * power of ten, at least 4) that fits `max`, so bars scale sensibly.
 */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].map((f) => f * magnitude).find((v) => v >= max);
  return step ?? max;
}

export interface ChartBar {
  weekStart: ISODate;
  jobs: number;
  /** Bar height in px (0 jobs is a 2px stub so the week is still visible). */
  height: number;
  /** "5 Oct", the Monday of the week. */
  label: string;
  isCurrent: boolean;
}

/** Index of the week containing `today`, or null when it is not in the list. */
export function currentWeekIndex(
  weekly: readonly WeeklyJobsDTO[],
  today: ISODate,
): number | null {
  const i = weekly.findIndex(
    (w) => w.week_start <= today && today < addDays(w.week_start, 7),
  );
  return i === -1 ? null : i;
}

/** Bars for the weekly chart, scaled to `plotHeight`. Pure so it can be tested as a table. */
export function chartBars(
  weekly: readonly WeeklyJobsDTO[],
  plotHeight: number,
  today: ISODate,
): { bars: ChartBar[]; axisMax: number } {
  const axisMax = niceMax(Math.max(0, ...weekly.map((w) => w.completed_jobs)));
  const current = currentWeekIndex(weekly, today);
  const bars = weekly.map((w, i) => ({
    weekStart: w.week_start,
    jobs: w.completed_jobs,
    height:
      w.completed_jobs === 0
        ? 2
        : Math.max(4, Math.round((w.completed_jobs / axisMax) * plotHeight)),
    label: formatDayMonth(w.week_start),
    isCurrent: i === current,
  }));
  return { bars, axisMax };
}

/** Which bar starts selected: the current week, else the latest week with jobs, else the last. */
export function defaultSelection(
  weekly: readonly WeeklyJobsDTO[],
  today: ISODate,
): number {
  const current = currentWeekIndex(weekly, today);
  if (current !== null) return current;
  for (let i = weekly.length - 1; i >= 0; i--) {
    if (weekly[i].completed_jobs > 0) return i;
  }
  return Math.max(weekly.length - 1, 0);
}

export const SOURCE_KEYS = ['whatsapp', 'companion', 'manual', 'web'] as const;
export type SourceKey = (typeof SOURCE_KEYS)[number];

export interface SourceRow {
  key: SourceKey;
  count: number;
  /** Whole percent of all bookings created. */
  percent: number;
}

/** Rows for "Where bookings come from", biggest first; empty when nothing was booked. */
export function sourceRows(by: BookingsBySourceDTO): SourceRow[] {
  const total = SOURCE_KEYS.reduce((sum, k) => sum + by[k], 0);
  if (total === 0) return [];
  return SOURCE_KEYS.map((key) => ({
    key,
    count: by[key],
    percent: Math.round((by[key] / total) * 100),
  })).sort((a, b) => b.count - a.count);
}

/** The busiest weekday and the hour it starts, e.g. `{ day: 'Saturday', time: '10:00' }`. */
export function busiestParts(busiest: BusiestSlotDTO): {
  day: string;
  time: string;
} {
  return {
    day: WEEKDAYS[busiest.weekday] ?? '',
    time: `${String(busiest.hour).padStart(2, '0')}:00`,
  };
}
