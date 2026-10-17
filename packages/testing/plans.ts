/**
 * In-memory PlanRepository. Mirrors the SQL `completed_jobs_in_month` / `month_report` (same completed-job
 * definition, month boundaries and Monday-start weeks); the SQL tests cover the real thing.
 */
import { DateTime } from 'luxon';

import type { AppointmentSource, AppointmentStatus, MonthKey, UUID } from '@booking/types';
import { notFound } from '@booking/features/lib/errors.ts';
import type { BusinessPlanProfile, MonthStats, PlanRepository } from '@booking/features/ports.ts';

export interface MemoryAppointment {
  businessId: UUID;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: AppointmentSource;
  priceCents: number;
  createdAt: string;
}

export interface MemoryPlanRepository extends PlanRepository {
  profiles: Map<UUID, BusinessPlanProfile>;
  appointments: MemoryAppointment[];
}

/** A completed job: ended by `now` and neither cancelled nor no_show. */
const isCompletedJob = (a: MemoryAppointment, now: Date) => a.status !== 'cancelled' && a.status !== 'no_show' && Date.parse(a.endsAt) <= now.getTime();

export function createMemoryPlanRepository(
  profiles: Record<UUID, Partial<BusinessPlanProfile> & Pick<BusinessPlanProfile, 'plan'>> = {},
  appointments: MemoryAppointment[] = [],
): MemoryPlanRepository {
  const map = new Map<UUID, BusinessPlanProfile>(
    Object.entries(profiles).map(([id, p]) => [id, { timezone: 'Africa/Johannesburg', currency: 'ZAR', nerovaAccountId: null, ...p }]),
  );

  const profileOf = (businessId: UUID): BusinessPlanProfile => {
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

  function completedJobs(businessId: UUID, month: MonthKey, now: Date): MemoryAppointment[] {
    const { start, end } = monthBounds(month, profileOf(businessId).timezone);
    return appointments.filter((a) => a.businessId === businessId && isCompletedJob(a, now) && inMonth(a.endsAt, start, end));
  }

  return {
    profiles: map,
    appointments,
    async getProfile(businessId) {
      return { ...profileOf(businessId) };
    },
    async setNerovaAccountId(businessId, accountId) {
      profileOf(businessId).nerovaAccountId = accountId;
    },
    async countBookingsCreated(businessId, from, to) {
      profileOf(businessId);
      return appointments.filter((a) => a.businessId === businessId && Date.parse(a.createdAt) >= from.getTime() && Date.parse(a.createdAt) < to.getTime()).length;
    },
    async getMonthStats(businessId, month, now): Promise<MonthStats> {
      const zone = profileOf(businessId).timezone;
      const { start, end } = monthBounds(month, zone);
      const mine = appointments.filter((a) => a.businessId === businessId);
      const jobs = completedJobs(businessId, month, now);

      const mostCommon = (values: number[]) => {
        const counts = new Map<number, number>();
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
      };
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
        bookings_created: { whatsapp: bySource('whatsapp'), nerova: bySource('nerova'), app: bySource('app'), web: bySource('web') },
        no_shows: startingInMonth.filter((a) => a.status === 'no_show').length,
        cancellations: startingInMonth.filter((a) => a.status === 'cancelled').length,
        busiest: weekday === undefined || hour === undefined ? null : { weekday, hour },
        weekly: weeks,
      };
    },
  };
}
