/** Supabase implementation of PlanRepository. Every query is scoped by business_id. */
import type { Json } from '@booking/database';
import type { UUID } from '@booking/types';
import type { Db } from '../../lib/db.ts';
import { mapDbError, notFound } from '../../lib/errors.ts';
import type { BusinessPlanProfile, MonthStats, PlanRepository } from '../ports.ts';
import { monthStart } from '../lib/usage.ts';

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
    bookings_created: { whatsapp: num(sources.whatsapp), nerova: num(sources.nerova), app: num(sources.app), web: num(sources.web) },
    no_shows: num(r.no_shows),
    cancellations: num(r.cancellations),
    busiest: busiest ? { weekday: num(busiest.weekday), hour: num(busiest.hour) } : null,
    weekly: weekly.map((w) => ({ week_start: String(w.week_start), completed_jobs: num(w.completed_jobs) })),
  };
}

export function createPlanRepository(deps: { db: Db }): PlanRepository {
  const { db } = deps;
  return {
    async getProfile(businessId: UUID): Promise<BusinessPlanProfile> {
      const { data, error } = await db
        .from('businesses')
        .select('plan, timezone, currency, nerova_account_id')
        .eq('id', businessId)
        .maybeSingle();
      if (error) throw mapDbError(error);
      if (!data) throw notFound('Business');
      return { plan: data.plan, timezone: data.timezone, currency: data.currency, nerovaAccountId: data.nerova_account_id };
    },
    async setNerovaAccountId(businessId, accountId) {
      const { error } = await db.from('businesses').update({ nerova_account_id: accountId }).eq('id', businessId);
      if (error) throw mapDbError(error);
    },
    async countCompletedJobs(businessId, month, now) {
      const { data, error } = await db.rpc('completed_jobs_in_month', {
        p_business_id: businessId,
        p_month: monthStart(month),
        p_now: now.toISOString(),
      });
      if (error) throw mapDbError(error);
      return num(data);
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
