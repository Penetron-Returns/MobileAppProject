import type { AppointmentStatus } from '@shared/api';

import { businessDate, type ISODate } from '@/lib/time';

export type ClientFilter = 'all' | 'recent' | 'regulars';

export const VIP_TAG = 'VIP';
export const RECENT_DAYS = 30;
/** A "Regular" has this many completed visits inside the window (docs/v1-scope.md). */
export const REGULAR_MIN_VISITS = 3;
export const REGULAR_WINDOW_DAYS = 180;
/** Most regulars the filter lists in one go (keeps the id list well inside URL limits). */
export const REGULARS_CAP = 100;

/**
 * PostgREST `or=` filter matching name or phone, or null for a blank query.
 * Characters with meaning in the filter grammar are stripped, not escaped.
 */
export function clientSearchFilter(query: string): string | null {
  const cleaned = query.replace(/[,()*%\\"'.:]/g, ' ').trim();
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, '');
  const parts = [`name.ilike.*${cleaned}*`];
  if (digits.length >= 3) parts.push(`phone_e164.ilike.*${digits}*`);
  return parts.join(',');
}

interface VisitLike {
  starts_at: string;
  status: AppointmentStatus;
}

/** "Has an appointment today" and "last visit" for a client row. */
export function summariseVisits(
  appointments: VisitLike[],
  now: Date,
  timezone: string,
): { todayAt: string | null; lastVisitDate: ISODate | null } {
  const today = businessDate(now, timezone);
  let todayAt: string | null = null;
  let lastVisitAt: string | null = null;
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    const starts = new Date(a.starts_at);
    if (businessDate(starts, timezone) === today) {
      if (!todayAt || a.starts_at < todayAt) todayAt = a.starts_at;
    } else if (starts < now && a.status !== 'no_show') {
      if (!lastVisitAt || a.starts_at > lastVisitAt) lastVisitAt = a.starts_at;
    }
  }
  return {
    todayAt,
    lastVisitDate: lastVisitAt ? businessDate(lastVisitAt, timezone) : null,
  };
}

interface StatAppointment {
  starts_at: string;
  status: AppointmentStatus;
  price_cents: number;
}

export interface ClientStats {
  visits: number;
  spentCents: number;
  avgSpendCents: number;
  cancellationRate: number;
}

/** Visits and spend count completed appointments; the rate covers every booking. */
export function clientStats(appointments: StatAppointment[]): ClientStats {
  const completed = appointments.filter((a) => a.status === 'completed');
  const spentCents = completed.reduce((sum, a) => sum + a.price_cents, 0);
  const cancelled = appointments.filter(
    (a) => a.status === 'cancelled' || a.status === 'no_show',
  ).length;
  return {
    visits: completed.length,
    spentCents,
    avgSpendCents: completed.length
      ? Math.round(spentCents / completed.length)
      : 0,
    cancellationRate: appointments.length ? cancelled / appointments.length : 0,
  };
}

export type HistoryStatus = 'upcoming' | AppointmentStatus;

/** Confirmed bookings still ahead of `now` read as upcoming. */
export function historyStatus(
  a: { status: AppointmentStatus; starts_at: string },
  now: Date,
): HistoryStatus {
  return a.status === 'confirmed' && new Date(a.starts_at) > now
    ? 'upcoming'
    : a.status;
}

const DAY_MS = 86_400_000;

/** Completed visits that started within the regular window ending at `now`. */
export function recentCompletedVisits(
  appointments: VisitLike[],
  now: Date,
): number {
  const since = now.getTime() - REGULAR_WINDOW_DAYS * DAY_MS;
  return appointments.filter((a) => {
    if (a.status !== 'completed') return false;
    const at = new Date(a.starts_at).getTime();
    return at >= since && at <= now.getTime();
  }).length;
}

/** "Regular": 3 or more completed visits in the last 180 days. Derived, never stored. */
export function isRegular(appointments: VisitLike[], now: Date): boolean {
  return recentCompletedVisits(appointments, now) >= REGULAR_MIN_VISITS;
}

/**
 * Client ids that qualify as regulars from raw completed-visit rows, most
 * visits first (ties by id so the order is stable), capped at `cap`.
 */
export function regularClientIds(
  rows: { client_id: string; starts_at: string }[],
  now: Date,
  cap = REGULARS_CAP,
): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const completed: VisitLike = {
      starts_at: row.starts_at,
      status: 'completed',
    };
    if (recentCompletedVisits([completed], now) === 0) continue;
    counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= REGULAR_MIN_VISITS)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, cap)
    .map(([id]) => id);
}

/** No-shows on record, shown quietly on a row once there are two or more. */
export function noShowCount(appointments: VisitLike[]): number {
  return appointments.filter((a) => a.status === 'no_show').length;
}

/**
 * Typical weeks between completed visits, or null with fewer than 3 visits
 * (two gaps are the least that says anything about a rhythm).
 */
export function visitCadenceWeeks(completedStarts: string[]): number | null {
  if (completedStarts.length < REGULAR_MIN_VISITS) return null;
  const times = completedStarts
    .map((s) => new Date(s).getTime())
    .sort((a, b) => a - b);
  const span = times[times.length - 1] - times[0];
  const weeks = span / (times.length - 1) / (7 * DAY_MS);
  return Math.max(1, Math.round(weeks));
}

/** Confirmed bookings still ahead of `now`, soonest first. */
export function upcomingAppointments<
  T extends { status: AppointmentStatus; starts_at: string },
>(appointments: T[], now: Date): T[] {
  return appointments
    .filter((a) => a.status === 'confirmed' && new Date(a.starts_at) > now)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
}
