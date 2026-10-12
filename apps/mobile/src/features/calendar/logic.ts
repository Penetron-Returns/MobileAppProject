import {
  addDays,
  addMonths,
  businessDate,
  endOfMonth,
  minutesSinceMidnight,
  startOfMonth,
  startOfWeek,
  timeToMinutes,
  type ISODate,
} from '@/lib/time';

import type { CalendarViewMode } from './navigation';

export const PX_PER_HOUR = 96;
const DEFAULT_DAY = { startMin: 9 * 60, endMin: 18 * 60 };

/** First and last (exclusive) business date covered by a view. */
export function periodRange(
  view: CalendarViewMode,
  anchor: ISODate,
): { from: ISODate; to: ISODate } {
  if (view === 'day') return { from: anchor, to: addDays(anchor, 1) };
  if (view === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const weeks = monthGrid(anchor);
  return {
    from: weeks[0][0].date,
    to: addDays(weeks[weeks.length - 1][6].date, 1),
  };
}

export function shiftAnchor(
  view: CalendarViewMode,
  anchor: ISODate,
  direction: 1 | -1,
): ISODate {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  return addMonths(startOfMonth(anchor), direction);
}

export interface MonthCell {
  date: ISODate;
  isCurrentMonth: boolean;
}

/** Monday-first weeks covering the anchor's month (5 or 6 rows). */
export function monthGrid(anchor: ISODate): MonthCell[][] {
  const first = startOfMonth(anchor);
  const last = endOfMonth(anchor);
  const month = first.slice(0, 7);
  const weeks: MonthCell[][] = [];
  let cursor = startOfWeek(first);
  while (cursor <= last) {
    const week: MonthCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push({ date: cursor, isCurrentMonth: cursor.startsWith(month) });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function weekDates(anchor: ISODate): ISODate[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function countByDate(
  appointments: { starts_at: string }[],
  timezone: string,
): Record<ISODate, number> {
  const counts: Record<ISODate, number> = {};
  for (const a of appointments) {
    const date = businessDate(a.starts_at, timezone);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return counts;
}

interface HoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

export interface MinuteSpan {
  startMin: number;
  endMin: number;
}

export function shiftsForWeekday(
  hours: HoursRow[],
  weekday: number,
): MinuteSpan[] {
  return hours
    .filter((h) => h.weekday === weekday)
    .map((h) => ({
      startMin: timeToMinutes(h.opens_at),
      endMin: timeToMinutes(h.closes_at),
    }))
    .sort((a, b) => a.startMin - b.startMin);
}

/** Gaps between a day's shifts (e.g. a lunch break between split shifts). */
export function breaksBetween(shifts: MinuteSpan[]): MinuteSpan[] {
  const breaks: MinuteSpan[] = [];
  for (let i = 1; i < shifts.length; i += 1) {
    if (shifts[i].startMin > shifts[i - 1].endMin) {
      breaks.push({
        startMin: shifts[i - 1].endMin,
        endMin: shifts[i].startMin,
      });
    }
  }
  return breaks;
}

/** Whole-hour window covering every shift and appointment shown. */
export function timelineWindow(spans: MinuteSpan[]): MinuteSpan {
  if (spans.length === 0) return DEFAULT_DAY;
  const start = Math.min(...spans.map((s) => s.startMin));
  const end = Math.max(...spans.map((s) => s.endMin));
  return {
    startMin: Math.floor(start / 60) * 60,
    endMin: Math.min(
      24 * 60,
      Math.max(Math.ceil(end / 60) * 60, Math.floor(start / 60) * 60 + 60),
    ),
  };
}

export function appointmentSpan(
  a: { starts_at: string; duration_minutes: number },
  timezone: string,
): MinuteSpan {
  const startMin = minutesSinceMidnight(a.starts_at, timezone);
  return { startMin, endMin: Math.min(24 * 60, startMin + a.duration_minutes) };
}

export interface LaidOutBlock<T> {
  item: T;
  span: MinuteSpan;
  lane: number;
  lanes: number;
}

/**
 * Places overlapping blocks side by side: each cluster of transitively
 * overlapping spans shares a lane count, each block takes the first free lane.
 */
export function layoutLanes<T>(
  items: { item: T; span: MinuteSpan }[],
): LaidOutBlock<T>[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.span.startMin - b.span.startMin || b.span.endMin - a.span.endMin,
  );
  const result: LaidOutBlock<T>[] = [];
  let cluster: LaidOutBlock<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const closeCluster = () => {
    cluster.forEach((b) => (b.lanes = laneEnds.length));
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const entry of sorted) {
    if (cluster.length && entry.span.startMin >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= entry.span.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.span.endMin;
    clusterEnd = Math.max(cluster.length ? clusterEnd : 0, entry.span.endMin);
    cluster.push({ ...entry, lane, lanes: 0 });
  }
  if (cluster.length) closeCluster();
  return result;
}

export function minutesToPx(minutes: number) {
  return (minutes / 60) * PX_PER_HOUR;
}
