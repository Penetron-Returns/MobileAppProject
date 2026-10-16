import {
  businessDate,
  formatDayMonth,
  formatTime,
  minutesSinceMidnight,
  toDate,
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

// ---------- bookings today ----------

/** Today's live bookings (cancelled ones free their time again). */
export function bookingsTodayCount(
  appointments: readonly Pick<AiAppointment, 'status'>[],
): number {
  return appointments.filter((a) => a.status !== 'cancelled').length;
}

// ---------- names ----------

/** A uuid, a long hex run or a test/seed marker: something a person would not be called. */
const MACHINE_NAME =
  /[0-9a-f]{8}-[0-9a-f]{4}|\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b|\b(?:test|e2e|qa|seed|demo)\b/i;

/**
 * The client's first name for the home's short lines ("With Thandi"), or
 * null when there is none or it looks machine-generated, so the screen never
 * shows ids or test data.
 */
export function displayFirstName(
  name: string | null | undefined,
): string | null {
  const trimmed = name?.trim();
  if (!trimmed || MACHINE_NAME.test(trimmed)) return null;
  return trimmed.split(/\s+/)[0] ?? null;
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
        name: displayFirstName(inProgress.client?.name),
        time: formatTime(inProgress.ends_at, timezone),
      }
    : null;
  const nextLine: NowLine | null = next
    ? {
        kind: 'next',
        name: displayFirstName(next.client?.name),
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
      name: displayFirstName(event.appointment?.client?.name),
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
