/** Plan usage, the plan catalogue and the "our data" half of the reports screen. */
import type { BillingUsageDTO, MonthKey, PlanDTO, PlansDTO, ReportsSummaryDTO, UUID } from '@booking/types';
import { AppError } from '../../lib/errors.ts';
import type { PlanRepository, UsageService } from '../ports.ts';
import { PLAN_CATALOG, PLAN_CURRENCY, PLAN_ORDER } from '../lib/planCatalog.ts';
import { computeUsage, currentMonth, isMonthKey, nextMonthStart } from '../lib/usage.ts';

export function createUsageService(deps: { repo: PlanRepository; clock: () => Date }): UsageService {
  const { repo, clock } = deps;

  function resolveMonth(month: MonthKey | undefined, timezone: string): MonthKey {
    if (month === undefined) return currentMonth(clock(), timezone);
    if (!isMonthKey(month)) throw new AppError('VALIDATION_FAILED', 'month must be YYYY-MM');
    return month;
  }

  async function getUsage(businessId: UUID, requested?: MonthKey): Promise<BillingUsageDTO> {
    const profile = await repo.getProfile(businessId);
    const month = resolveMonth(requested, profile.timezone);
    const completed = await repo.countCompletedJobs(businessId, month, clock());
    return {
      plan: profile.plan,
      month,
      completed_jobs: completed,
      ...computeUsage(profile.plan, completed),
      resets_on: nextMonthStart(month),
    };
  }

  async function listPlans(businessId: UUID): Promise<PlansDTO> {
    const { plan } = await repo.getProfile(businessId);
    const plans: PlanDTO[] = PLAN_ORDER.map((id) => {
      const entry = PLAN_CATALOG[id];
      return {
        id,
        name: entry.name,
        price_cents: entry.priceCents,
        currency: PLAN_CURRENCY,
        included_jobs: entry.includedJobs,
        extra_job_cents: entry.extraJobCents,
        has_companion: entry.includedJobs !== null,
        is_current: id === plan,
        checkout_url: null,
      };
    });
    return { current_plan: plan, plans };
  }

  async function getReport(businessId: UUID, requested?: MonthKey): Promise<Omit<ReportsSummaryDTO, 'companion'>> {
    const profile = await repo.getProfile(businessId);
    const month = resolveMonth(requested, profile.timezone);
    const stats = await repo.getMonthStats(businessId, month, clock());
    return {
      month,
      currency: profile.currency,
      completed_jobs: stats.completed_jobs,
      revenue_cents: stats.revenue_cents,
      bookings_created: {
        whatsapp: stats.bookings_created.whatsapp,
        companion: stats.bookings_created.nerova,
        manual: stats.bookings_created.app,
        web: stats.bookings_created.web,
      },
      no_shows: stats.no_shows,
      cancellations: stats.cancellations,
      busiest: stats.busiest,
      weekly: stats.weekly,
      usage: {
        plan: profile.plan,
        month,
        completed_jobs: stats.completed_jobs,
        ...computeUsage(profile.plan, stats.completed_jobs),
        resets_on: nextMonthStart(month),
      },
    };
  }

  return { getUsage, listPlans, getReport };
}
