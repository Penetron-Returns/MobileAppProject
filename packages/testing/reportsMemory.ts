/**
 * In-memory ReportRepository. Mirrors the SQL `month_report` (same completed-job definition, month boundaries and
 * Monday-start weeks); the SQL tests cover the real thing.
 */
import { DateTime } from 'luxon';

import type { AppointmentSource, AppointmentStatus, MonthKey, UUID } from '@booking/types';
import { notFound } from '@booking/features/lib/errors.ts';
import type { BusinessReportProfile, MonthStats, ReportRepository } from '@booking/features/ports.ts';

export interface MemoryAppointment {
  businessId: UUID;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  priceCents: number;
  createdAt: string;
}

export interface MemoryReportRepository extends ReportRepository {
  profiles: Map<UUID, BusinessReportProfile>;
  appointments: MemoryAppointment[];
}

/** A completed job: ended by `now` and neither cancelled nor no_show. */
const isCompletedJob = (a: MemoryAppointment, now: Date) => a.status !== 'cancelled' && a.status !== 'no_show' && Date.parse(a.endsAt) <= now.getTime();

export function createMemoryReportRepository(
  profiles: Record<UUID, Partial<BusinessReportProfile>> = {},
  appointments: MemoryAppointment[] = [],
): MemoryReportRepository {
  const map = new Map<UUID, BusinessReportProfile>(
    Object.entries(profiles).map(([id, p]) => [id, { timezone: 'Africa/Johannesburg', currency: 'ZAR', ...p }]),
  );

  const profileOf = (businessId: UUID): BusinessReportProfile => {
    const profile = map.get(businessId);
    if (!profile) throw notFound('Business');
    return profile;
  };

  const monthBounds = (month: MonthKey, zone: string) => {
    const start = DateTime.fromISO(`${month}-01`, { zone });
    return { start, end: start.plus({ months: 1 }) };
  };

  const inMonth = (iso: string, start: DateTime, end: DateTime) => {
    const ms = Date.parse(iso);
    return ms >= start.toMillis() && ms < end.toMillis();
  };

  const mostCommon = (values: number[]) => {
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  };

  return {
    profiles: map,
    appointments,
    async getProfile(businessId) {
      return { ...profileOf(businessId) };
    },
    async getMonthStats(businessId, month, now): Promise<MonthStats> {
      const zone = profileOf(businessId).timezone;
      const { start, end } = monthBounds(month, zone);
      const mine = appointments.filter((a) => a.businessId === businessId);
      const jobs = mine.filter((a) => isCompletedJob(a, now) && inMonth(a.endsAt, start, end));
      const local = (iso: string) => DateTime.fromISO(iso, { zone });
      const weekday = mostCommon(jobs.map((a) => local(a.startsAt).weekday % 7));
      const hour = mostCommon(jobs.map((a) => local(a.startsAt).hour));

      const weeks: { week_start: string; completed_jobs: number }[] = [];
      for (let week = start.startOf('week'); week < end; week = week.plus({ weeks: 1 })) {
        const next = week.plus({ weeks: 1 });
        weeks.push({
          week_start: week.toISODate()!,
          completed_jobs: jobs.filter((a) => {
            const day = local(a.endsAt).startOf('day');
            return day >= week && day < next;
          }).length,
        });
      }

      const created = mine.filter((a) => inMonth(a.createdAt, start, end));
      const startingInMonth = mine.filter((a) => inMonth(a.startsAt, start, end));
      const bySource = (source: AppointmentSource) => created.filter((a) => a.source === source).length;
      return {
        completed_jobs: jobs.length,
        revenue_cents: jobs.reduce((sum, a) => sum + a.priceCents, 0),
        bookings_created: { whatsapp: bySource('whatsapp'), app: bySource('app'), web: bySource('web') },
        no_shows: startingInMonth.filter((a) => a.status === 'no_show').length,
        cancellations: startingInMonth.filter((a) => a.status === 'cancelled').length,
        busiest: weekday === undefined || hour === undefined ? null : { weekday, hour },
        weekly: weeks,
      };
    },
  };
}
