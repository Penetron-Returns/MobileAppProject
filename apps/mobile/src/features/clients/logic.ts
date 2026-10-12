import type { AppointmentStatus } from '@shared/api';

import { businessDate, type ISODate } from '@/lib/time';

export type ClientFilter = 'all' | 'recent' | 'vip';

export const VIP_TAG = 'VIP';
export const RECENT_DAYS = 30;

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
