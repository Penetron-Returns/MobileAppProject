/** Supabase implementation of ReportRepository. Every query is scoped by business_id. */
import type { Json } from '@booking/database';
import type { UUID } from '@booking/types';
import type { Db } from '../../lib/db.ts';
import { mapDbError, notFound } from '../../lib/errors.ts';
import { monthStart } from '../lib/month.ts';
import type { BusinessReportProfile, MonthStats, ReportRepository } from '../ports.ts';

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** `month_report` returns jsonb; narrow it to MonthStats once, here. */
export function parseMonthStats(raw: Json): MonthStats {
  const r = asRecord(raw);
  const sources = asRecord(r.bookings_created);
  const busiest = r.busiest ? asRecord(r.busiest) : null;
  const weekly = Array.isArray(r.weekly) ? r.weekly.map(asRecord) : [];
  return {
    completed_jobs: num(r.completed_jobs),
    revenue_cents: num(r.revenue_cents),
    bookings_created: { whatsapp: num(sources.whatsapp), app: num(sources.app), web: num(sources.web) },
    no_shows: num(r.no_shows),
    cancellations: num(r.cancellations),
    busiest: busiest ? { weekday: num(busiest.weekday), hour: num(busiest.hour) } : null,
    weekly: weekly.map((w) => ({ week_start: String(w.week_start), completed_jobs: num(w.completed_jobs) })),
  };
}

export function createReportRepository(deps: { db: Db }): ReportRepository {
  const { db } = deps;
  return {
    async getProfile(businessId: UUID): Promise<BusinessReportProfile> {
      const { data, error } = await db.from('businesses').select('timezone, currency').eq('id', businessId).maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) throw notFound('Business');
      return { timezone: data.timezone, currency: data.currency };
    },
    async getMonthStats(businessId, month, now) {
      const { data, error } = await db.rpc('month_report', {
        p_business_id: businessId,
        p_month: monthStart(month),
        p_now: now.toISOString(),
      });
      if (error) throw mapDbError(error);
      return parseMonthStats(data);
    },
  };
}
