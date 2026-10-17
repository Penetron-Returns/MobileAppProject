/** Plan usage, the plan catalogue and the "our data" half of the reports screen. */
import type { BillingUsageDTO, MonthKey, PlanDTO, PlanKey, PlansDTO, ReportsSummaryDTO, UUID } from '@booking/types';
import { AppError } from '../../lib/errors.ts';
import type { BillingSummary } from '../../billing/ports.ts';
import type { PlanRepository, UsageService } from '../ports.ts';
import { PLAN_CATALOG, PLAN_CURRENCY, PLAN_ORDER } from '../lib/planCatalog.ts';
import { calendarPeriod, computeUsage, currentMonth, isMonthKey, subscriptionPeriod, type UsagePeriod } from '../lib/usage.ts';

export function createUsageService(deps: { repo: PlanRepository; clock: () => Date; billing?: BillingSummary }): UsageService {
  const { repo, clock, billing } = deps;

  function validMonth(month: MonthKey): MonthKey {
    if (!isMonthKey(month)) throw new AppError('VALIDATION_FAILED', 'month must be YYYY-MM');
    return month;
  }

  /**
   * What the plan meters: every booking CREATED in the period, whatever its source or outcome. An explicit month is
   * that calendar month; otherwise the Stripe billing period when one is known (so the app agrees with the invoice),
   * else the calendar month in the business timezone.
   */
  async function resolvePeriod(businessId: UUID, timezone: string, requested?: MonthKey): Promise<UsagePeriod> {
    if (requested !== undefined) return calendarPeriod(validMonth(requested), timezone);
    const subscribed = billing ? subscriptionPeriod((await billing.getSubscription(businessId))?.current_period_end ?? null, timezone, clock()) : null;
    return subscribed ?? calendarPeriod(currentMonth(clock(), timezone), timezone);
  }

  async function usageFor(businessId: UUID, profile: { plan: PlanKey; timezone: string }, requested?: MonthKey): Promise<BillingUsageDTO> {
    const period = await resolvePeriod(businessId, profile.timezone, requested);
    const bookings = await repo.countBookingsCreated(businessId, period.start, period.end);
    return {
      plan: profile.plan,
      month: period.month,
      completed_jobs: bookings,
      bookings,
      period_start: period.start.toISOString(),
      period_end: period.end.toISOString(),
      ...computeUsage(profile.plan, bookings),
      resets_on: period.resetsOn,
    };
  }

  async function getUsage(businessId: UUID, requested?: MonthKey): Promise<BillingUsageDTO> {
    return usageFor(businessId, await repo.getProfile(businessId), requested);
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
        checkout_enabled: id !== plan && (billing?.isCheckoutAvailable(id) ?? false),
      };
    });
    return { current_plan: plan, plans, subscription: (await billing?.getSubscription(businessId)) ?? null };
  }

  async function getReport(businessId: UUID, requested?: MonthKey): Promise<Omit<ReportsSummaryDTO, 'companion'>> {
    const profile = await repo.getProfile(businessId);
    const month = requested === undefined ? currentMonth(clock(), profile.timezone) : validMonth(requested);
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
      usage: await usageFor(businessId, profile, requested),
    };
  }

  return { getUsage, listPlans, getReport };
}
