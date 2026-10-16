import {
  businessDate,
  formatDayMonth,
  formatTime,
  minutesSinceMidnight,
  timeToMinutes,
  toDate,
  weekdayOf,
  type ISODate,
} from '@/lib/time';

import { selectLaterToday, selectUpNext, type TodayAppointment } from './logic';

/** A booking as the AI home reads it: the Today row plus where it came from. */
export type AiAppointment = TodayAppointment & { source: string };

/** The lifecycle events the "Today so far" digest reports. */
export type DigestKind = 'booked' | 'moved' | 'cancelled';

export interface AiEvent {
  id: string;
  /** `appointment_event_type` from the database; only the digest kinds are used. */
  type: string;
  occurred_at: string;
  actor: string;
  appointment: {
    starts_at: string;
    client: { name: string | null } | null;
  } | null;
}

const EVENT_KIND: Record<string, DigestKind | undefined> = {
  created: 'booked',
  rescheduled: 'moved',
  cancelled: 'cancelled',
};

/** Before this business-local minute an event belongs to "This morning". */
const NOON = 12 * 60;

// ---------- booked % ----------

const isBooked = (a: Pick<AiAppointment, 'status'>) => a.status !== 'cancelled';

/** Minutes of today's bookings (cancelled ones free their time again). */
export function bookedMinutes(appointments: readonly AiAppointment[]): number {
  return appointments
    .filter(isBooked)
    .reduce((sum, a) => sum + a.duration_minutes, 0);
}

export interface HoursRule {
  weekday: number;
  /** `HH:mm[:ss]` */
  opens_at: string;
  closes_at: string;
}

export interface StaffRule {
  staff_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

const span = (from: string, to: string) =>
  Math.max(timeToMinutes(to) - timeToMinutes(from), 0);

/**
 * Staff-minutes the business can sell on `date`: for each bookable person,
 * their own availability for that weekday, or the business hours when they
 * have no rules at all (BUILD_PLAN: availability_rules). A closed day, or no
 * bookable staff, is 0.
 */
export function bookableMinutes(options: {
  date: ISODate;
  hours: readonly HoursRule[];
  staffIds: readonly string[];
  rules: readonly StaffRule[];
}): number {
  const weekday = weekdayOf(options.date);
  const businessMinutes = options.hours
    .filter((h) => h.weekday === weekday)
    .reduce((sum, h) => sum + span(h.opens_at, h.closes_at), 0);
  return options.staffIds.reduce((total, id) => {
    const own = options.rules.filter((r) => r.staff_id === id);
    if (own.length === 0) return total + businessMinutes;
    return (
      total +
      own
        .filter((r) => r.weekday === weekday)
        .reduce((sum, r) => sum + span(r.start_time, r.end_time), 0)
    );
  }, 0);
}

/** Whole percent of bookable time that is booked (capped at 100), or null when nothing is bookable. */
export function bookedPercent(booked: number, bookable: number): number | null {
  if (bookable <= 0) return null;
  return Math.min(Math.round((booked / bookable) * 100), 100);
}

// ---------- money and Clovie's share ----------

/** Takings of work that has ended: not cancelled, not a no-show (cents). */
export function revenueSoFarCents(
  appointments: readonly AiAppointment[],
  now: Date,
): number {
  return appointments
    .filter(
      (a) =>
        (a.status === 'confirmed' || a.status === 'completed') &&
        toDate(a.ends_at).getTime() <= now.getTime(),
    )
    .reduce((sum, a) => sum + a.price_cents, 0);
}

/** Today's live bookings that the companion made (`source = 'nerova'`). */
export function clovieBookedCount(
  appointments: readonly AiAppointment[],
): number {
  return appointments.filter((a) => isBooked(a) && a.source === 'nerova')
    .length;
}

// ---------- the "now" row ----------

export type NowLine =
  | { kind: 'working' | 'calm' | 'quiet' }
  | { kind: 'with'; name: string | null; time: string }
  | { kind: 'next'; name: string | null; time: string };

export interface NowRow {
  primary: NowLine;
  secondary: NowLine | null;
}

/**
 * What Clovie says under the clover. A busy companion leads; otherwise the
 * booking under way ("With Thandi until 11:30") or a calm line, and the next
 * booking underneath.
 */
export function nowRow(options: {
  appointments: readonly AiAppointment[];
  now: Date;
  timezone: string;
  isBusy: boolean;
}): NowRow {
  const { appointments, now, timezone, isBusy } = options;
  const list = [...appointments];
  const head = selectUpNext(list, now);
  const inProgress =
    head && toDate(head.starts_at).getTime() <= now.getTime() ? head : null;
  const next = inProgress
    ? (selectLaterToday(list, now, 1).rows[0] ?? null)
    : head;

  const withLine: NowLine | null = inProgress
    ? {
        kind: 'with',
        name: inProgress.client?.name ?? null,
        time: formatTime(inProgress.ends_at, timezone),
      }
    : null;
  const nextLine: NowLine | null = next
    ? {
        kind: 'next',
        name: next.client?.name ?? null,
        time: formatTime(next.starts_at, timezone),
      }
    : null;

  if (isBusy)
    return { primary: { kind: 'working' }, secondary: withLine ?? nextLine };
  if (withLine) return { primary: withLine, secondary: nextLine };
  if (nextLine) return { primary: { kind: 'calm' }, secondary: nextLine };
  return { primary: { kind: 'quiet' }, secondary: null };
}

// ---------- today so far ----------

export interface DigestEntry {
  id: string;
  /** `HH:mm`, business time. */
  time: string;
  kind: DigestKind;
  name: string | null;
  /** The booking's time (`HH:mm`, or `14 Oct HH:mm` when it is not today). */
  when: string;
  byClovie: boolean;
}

export interface DigestPart {
  counts: Record<DigestKind, number>;
  entries: DigestEntry[];
}

export interface Digest {
  morning: DigestPart;
  afternoon: DigestPart;
}

const emptyPart = (): DigestPart => ({
  counts: { booked: 0, moved: 0, cancelled: 0 },
  entries: [],
});

/**
 * Today's changes grouped into morning (before 12:00 business time) and
 * afternoon, oldest first. Events from other days and kinds the digest does
 * not report (reminders, check-ins) are skipped.
 */
export function buildDigest(
  events: readonly AiEvent[],
  date: ISODate,
  timezone: string,
): Digest {
  const digest: Digest = { morning: emptyPart(), afternoon: emptyPart() };
  const sorted = [...events].sort(
    (a, b) =>
      toDate(a.occurred_at).getTime() - toDate(b.occurred_at).getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const event of sorted) {
    const kind = EVENT_KIND[event.type];
    if (!kind || businessDate(event.occurred_at, timezone) !== date) continue;
    const part =
      minutesSinceMidnight(event.occurred_at, timezone) < NOON
        ? digest.morning
        : digest.afternoon;
    part.counts[kind] += 1;
    part.entries.push({
      id: event.id,
      time: formatTime(event.occurred_at, timezone),
      kind,
      name: event.appointment?.client?.name ?? null,
      when: appointmentWhen(event.appointment?.starts_at, date, timezone),
      byClovie: event.actor === 'nerova',
    });
  }
  return digest;
}

function appointmentWhen(
  startsAt: string | undefined,
  date: ISODate,
  timezone: string,
): string {
  if (!startsAt) return '';
  const day = businessDate(startsAt, timezone);
  const time = formatTime(startsAt, timezone);
  return day === date ? time : `${formatDayMonth(day)} ${time}`;
}

/** The non-zero counts of a part in reading order: booked, moved, cancelled. */
export function digestCounts(
  part: DigestPart,
): { kind: DigestKind; count: number }[] {
  return (['booked', 'moved', 'cancelled'] as const)
    .map((kind) => ({ kind, count: part.counts[kind] }))
    .filter((c) => c.count > 0);
}

/** True once the business-local clock has reached 12:00, when "This afternoon" has begun. */
export function hasAfternoonStarted(now: Date, timezone: string): boolean {
  return minutesSinceMidnight(now, timezone) >= NOON;
}
