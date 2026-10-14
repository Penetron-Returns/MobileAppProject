import type { Database } from '@booking/database';

import {
  MONTHS,
  WEEKDAYS,
  dayRangeUtc,
  parseISODate,
  toDate,
  todayISO,
  weekdayOf,
  type ISODate,
} from '@/lib/time';

type AppointmentRow = Database['public']['Tables']['appointments']['Row'];

/** What the Today screen needs from an appointment (a subset of the row plus joins). */
export type TodayAppointment = Pick<
  AppointmentRow,
  | 'id'
  | 'starts_at'
  | 'ends_at'
  | 'duration_minutes'
  | 'status'
  | 'checked_in_at'
  | 'price_cents'
> & {
  client: { name: string | null; phone_e164: string } | null;
  service: { name: string } | null;
  staff: { name: string } | null;
};

export interface TodayWindow {
  /** Business-timezone calendar date of `now`. */
  date: ISODate;
  /** [from, to) as UTC instants, i.e. the business's whole day (23 or 25 h on DST changes). */
  from: Date;
  to: Date;
}

/** The whole business-local day for a calendar date. */
export function dayWindow(date: ISODate, timezone: string): TodayWindow {
  const { from, to } = dayRangeUtc(date, timezone);
  return { date, from, to };
}

/** The business-local day containing `now`. Pure: `now` and the timezone are injected. */
export function todayWindow(now: Date, timezone: string): TodayWindow {
  return dayWindow(todayISO(timezone, now), timezone);
}

const startMs = (a: TodayAppointment) => toDate(a.starts_at).getTime();
const endMs = (a: TodayAppointment) => toDate(a.ends_at).getTime();

/** Only confirmed bookings are still waiting to happen. */
function isActionable(a: TodayAppointment): boolean {
  return a.status === 'confirmed';
}

/**
 * Appointments still ahead or in progress: confirmed and not yet ended,
 * earliest first (ties broken by id so the order is stable).
 */
function upcoming(appointments: TodayAppointment[], now: Date) {
  return appointments
    .filter((a) => isActionable(a) && endMs(a) > now.getTime())
    .sort((a, b) => startMs(a) - startMs(b) || a.id.localeCompare(b.id));
}

/** The hero card's booking: the earliest one that has not finished. */
export function selectUpNext(
  appointments: TodayAppointment[],
  now: Date,
): TodayAppointment | null {
  return upcoming(appointments, now)[0] ?? null;
}

export interface LaterToday {
  rows: TodayAppointment[];
  /** Bookings after the visible rows, for the "See all N more" link. */
  hiddenCount: number;
}

/** The list under the hero: the next `limit` bookings after the up-next one. */
export function selectLaterToday(
  appointments: TodayAppointment[],
  now: Date,
  limit = 4,
): LaterToday {
  const [, ...rest] = upcoming(appointments, now);
  return {
    rows: rest.slice(0, limit),
    hiddenCount: Math.max(rest.length - limit, 0),
  };
}

/** Takings expected today: booked and finished work, not cancelled or no-show. */
export function expectedTotalCents(appointments: TodayAppointment[]): number {
  return appointments
    .filter((a) => a.status === 'confirmed' || a.status === 'completed')
    .reduce((sum, a) => sum + a.price_cents, 0);
}

/**
 * The design flags unconfirmed bookings. The schema has no `pending`
 * appointment status yet, so this never fires today; it is the single place
 * to extend when one is added.
 */
export function needsConfirming(a: Pick<TodayAppointment, 'status'>): boolean {
  return (a.status as string) === 'pending';
}

export type UpNextTiming =
  { kind: 'arrived' } | { kind: 'now' } | { kind: 'in'; minutes: number };

/** How the hero card describes when the booking is: arrived, under way, or in N minutes. */
export function upNextTiming(a: TodayAppointment, now: Date): UpNextTiming {
  if (a.checked_in_at) return { kind: 'arrived' };
  const minutes = Math.ceil((startMs(a) - now.getTime()) / 60_000);
  return minutes <= 0 ? { kind: 'now' } : { kind: 'in', minutes };
}

/** `Wednesday 14 October` for a business-local date. */
export function formatDayCaption(date: ISODate): string {
  const { m, d } = parseISODate(date);
  return `${WEEKDAYS[weekdayOf(date)]} ${d} ${MONTHS[m - 1]}`;
}
