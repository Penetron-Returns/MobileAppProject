import {
  addDays,
  businessDate,
  minutesSinceMidnight,
  startOfWeek,
  weekdayOf,
  type ISODate,
} from '@/lib/time';
import type { CalendarViewMode } from './navigation';
import type { CalendarSchedule } from './config';
import {
  businessWindows,
  specialDayOn,
  staffBlocks,
  staffWindows,
  timelineWindow,
  type BlockedSpan,
  type MinuteSpan,
  type SpecialDayRow,
  type TimeOffRow,
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
  /** Breaks and time off inside the working hours. */
  blocks: BlockedSpan[];
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
  schedule: CalendarSchedule;
}): {
  columns: DayColumn<S, A>[];
  window: MinuteSpan;
  /** The closed special day (holiday) this date is, if any. */
  closedDay: SpecialDayRow | null;
} {
  const { date, timezone, appointments, schedule } = opts;
  const columns = columnStaff(opts.staff, appointments).map((staff) => {
    const working = staffWindows({ date, staffId: staff.id, ...schedule });
    return {
      staff,
      working,
      blocks: staffBlocks({
        date,
        staffId: staff.id,
        working,
        breaks: schedule.breaks,
        timeOff: schedule.timeOff,
      }),
      appointments: appointments.filter((a) => a.staff.id === staff.id),
    };
  });
  const special = specialDayOn(date, schedule.specialDays);
  const window = timelineWindow([
    ...columns.flatMap((c) => c.working),
    ...appointments.map((a) => appointmentSpan(a, timezone)),
  ]);
  return {
    columns,
    window,
    closedDay: special?.is_closed ? special : null,
  };
}

// ---------- the week list ----------

export interface WeekDay {
  date: ISODate;
  count: number;
  isClosed: boolean;
  /** Name of the closed special day ("Christmas Day"), when that is why it is closed. */
  closedName: string | null;
  /** People off all or part of the day (time off), for a quiet note. */
  off: { staffId: string; reason: TimeOffRow['reason'] }[];
  isToday: boolean;
  /** 0..1 share of the busiest day, for the bar. */
  fullness: number;
}

export interface WeekSummary {
  days: WeekDay[];
  total: number;
}

/** More staff than this and the week filter is a pull-down menu instead of chips. */
export const MAX_STAFF_CHIPS = 4;

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
  schedule: CalendarSchedule;
  /** Limit the time off notes to one person. */
  staffId?: string | null;
}): WeekSummary {
  const { anchor, today, timezone, appointments, schedule, staffId } = opts;
  const counts: Record<ISODate, number> = {};
  for (const a of appointments) {
    const date = businessDate(a.starts_at, timezone);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  const dates = weekDates(anchor);
  const busiest = Math.max(1, ...dates.map((d) => counts[d] ?? 0));
  const days = dates.map((date) => {
    const count = counts[date] ?? 0;
    const special = specialDayOn(date, schedule.specialDays);
    const isClosed =
      count === 0 &&
      businessWindows(date, schedule.hours, schedule.specialDays).length === 0;
    return {
      date,
      count,
      isClosed,
      closedName: isClosed && special?.is_closed ? special.name : null,
      off: schedule.timeOff
        .filter(
          (t) =>
            t.starts_on <= date &&
            date <= t.ends_on &&
            (!staffId || t.staff_id === staffId),
        )
        .map((t) => ({ staffId: t.staff_id, reason: t.reason })),
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

/** Press positions snap to this many minutes (the slot grid of the booking rules' default). */
export const PRESS_SNAP_MINUTES = 15;

/**
 * The time a long-press on an empty part of a staff column stands for:
 * `y` px from the column top, snapped down to the quarter hour and kept
 * inside the visible window. Returns minutes since midnight.
 */
export function minuteAtOffset(
  y: number,
  window: MinuteSpan,
  step: number = PRESS_SNAP_MINUTES,
): number {
  const raw = window.startMin + (y / PX_PER_HOUR) * 60;
  const snapped = Math.floor(raw / step) * step;
  return Math.min(Math.max(snapped, window.startMin), window.endMin - step);
}

/** Route params for New booking opened from the calendar; staff and time are optional. */
export interface NewBookingPrefill {
  staffId?: string;
  date: ISODate;
  /** `HH:mm` in the business timezone. */
  time?: string;
}

export function newBookingHref(prefill: NewBookingPrefill) {
  const params: Record<string, string> = { date: prefill.date };
  if (prefill.staffId) params.staffId = prefill.staffId;
  if (prefill.time) params.time = prefill.time;
  return { pathname: '/new-booking', params } as const;
}
