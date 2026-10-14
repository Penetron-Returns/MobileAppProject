import {
  addDays,
  businessDate,
  minutesSinceMidnight,
  startOfWeek,
  weekdayOf,
  type ISODate,
} from '@/lib/time';
import type { CalendarViewMode } from './navigation';
import {
  businessWindows,
  staffWindows,
  timelineWindow,
  type HoursRow,
  type MinuteSpan,
  type OverrideRow,
  type RuleRow,
} from './spans';

export * from './spans';

export const PX_PER_HOUR = 96;

/** Shifts the view by one period. */
export function shiftAnchor(
  view: CalendarViewMode,
  anchor: ISODate,
  direction: 1 | -1,
): ISODate {
  return addDays(anchor, (view === 'week' ? 7 : 1) * direction);
}

export function weekDates(anchor: ISODate): ISODate[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export interface StripDay {
  date: ISODate;
  /** Day of the month. */
  num: number;
  weekday: number;
  isToday: boolean;
  isSelected: boolean;
}

/** The seven days (Monday first) around `anchor`, for the day view's date strip. */
export function weekStrip(anchor: ISODate, today: ISODate): StripDay[] {
  return weekDates(anchor).map((date) => ({
    date,
    num: Number(date.slice(8, 10)),
    weekday: weekdayOf(date),
    isToday: date === today,
    isSelected: date === anchor,
  }));
}

export function appointmentSpan(
  a: { starts_at: string; duration_minutes: number },
  timezone: string,
): MinuteSpan {
  const startMin = minutesSinceMidnight(a.starts_at, timezone);
  return { startMin, endMin: Math.min(24 * 60, startMin + a.duration_minutes) };
}

export function minutesToPx(minutes: number) {
  return (minutes / 60) * PX_PER_HOUR;
}

/** Minutes since midnight for the now line, or null when `date` is not today or it is off the grid. */
export function nowMinute(
  now: Date,
  timezone: string,
  date: ISODate,
  window: MinuteSpan,
): number | null {
  if (businessDate(now, timezone) !== date) return null;
  const minute = minutesSinceMidnight(now, timezone);
  return minute >= window.startMin && minute <= window.endMin ? minute : null;
}

/** Column width: at least `minWidth`, widened so one or two columns fill the screen. */
export function columnWidth(
  available: number,
  columns: number,
  minWidth = 150,
): number {
  if (columns <= 0) return minWidth;
  return Math.max(minWidth, Math.floor(available / Math.min(columns, 2)));
}

interface StaffLike {
  id: string;
  is_active: boolean;
}

/** Active staff, plus anyone with a booking that day (a deactivated colleague still shows their work). */
export function columnStaff<S extends StaffLike>(
  staff: S[],
  appointments: { staff: { id: string } }[],
): S[] {
  const booked = new Set(appointments.map((a) => a.staff.id));
  return staff.filter((s) => s.is_active || booked.has(s.id));
}

export interface DayColumn<S, A> {
  staff: S;
  working: MinuteSpan[];
  appointments: A[];
}

/** Everything the grid draws: the columns and the shared hour window. */
export function buildDayColumns<
  S extends StaffLike,
  A extends {
    starts_at: string;
    duration_minutes: number;
    staff: { id: string };
  },
>(opts: {
  date: ISODate;
  timezone: string;
  staff: S[];
  appointments: A[];
  hours: HoursRow[];
  rules: RuleRow[];
  overrides: OverrideRow[];
}): { columns: DayColumn<S, A>[]; window: MinuteSpan } {
  const { date, timezone, appointments, hours, rules, overrides } = opts;
  const columns = columnStaff(opts.staff, appointments).map((staff) => ({
    staff,
    working: staffWindows({ date, staffId: staff.id, hours, rules, overrides }),
    appointments: appointments.filter((a) => a.staff.id === staff.id),
  }));
  const window = timelineWindow([
    ...columns.flatMap((c) => c.working),
    ...appointments.map((a) => appointmentSpan(a, timezone)),
  ]);
  return { columns, window };
}

// ---------- the week list ----------

export interface WeekDay {
  date: ISODate;
  count: number;
  isClosed: boolean;
  isToday: boolean;
  /** 0..1 share of the busiest day, for the bar. */
  fullness: number;
}

export interface WeekSummary {
  days: WeekDay[];
  total: number;
}

export function filterByStaff<A extends { staff: { id: string } }>(
  appointments: A[],
  staffId: string | null,
): A[] {
  return staffId
    ? appointments.filter((a) => a.staff.id === staffId)
    : appointments;
}

export function weekSummary(opts: {
  anchor: ISODate;
  today: ISODate;
  timezone: string;
  appointments: { starts_at: string }[];
  hours: HoursRow[];
  overrides: OverrideRow[];
}): WeekSummary {
  const { anchor, today, timezone, appointments, hours, overrides } = opts;
  const counts: Record<ISODate, number> = {};
  for (const a of appointments) {
    const date = businessDate(a.starts_at, timezone);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  const dates = weekDates(anchor);
  const busiest = Math.max(1, ...dates.map((d) => counts[d] ?? 0));
  const days = dates.map((date) => {
    const count = counts[date] ?? 0;
    return {
      date,
      count,
      isClosed:
        count === 0 && businessWindows(date, hours, overrides).length === 0,
      isToday: date === today,
      fullness: count / busiest,
    };
  });
  return { days, total: days.reduce((sum, d) => sum + d.count, 0) };
}

export type BlockTone = 'upcoming' | 'arrived' | 'done' | 'noShow';

/** How a booking block is tinted: exceptions stand out, ordinary bookings stay quiet. */
export function blockTone(a: {
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  checked_in_at: string | null;
}): BlockTone {
  if (a.status === 'no_show') return 'noShow';
  if (a.status === 'completed') return 'done';
  return a.checked_in_at ? 'arrived' : 'upcoming';
}
