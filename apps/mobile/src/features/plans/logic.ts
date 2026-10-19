import type {
  BillingUsageDTO,
  FeatureEntitlementDTO,
  FeatureKey,
  UsageState,
} from '@booking/types';

import { formatDayMonth } from '@/lib/time';

/** Whether the plan's feature list unlocks `feature`. Fails closed on missing data. */
export function hasFeature(
  features: readonly FeatureEntitlementDTO[] | undefined,
  feature: FeatureKey,
): boolean {
  return features?.some((f) => f.feature === feature) ?? false;
}

/** Monthly cap for a feature: null when uncapped, not in the plan, or unknown. */
export function monthlyLimit(
  features: readonly FeatureEntitlementDTO[] | undefined,
  feature: FeatureKey,
): number | null {
  return features?.find((f) => f.feature === feature)?.monthly_limit ?? null;
}

/**
 * The currency the plan catalogue is priced in (the server's PLAN_CURRENCY,
 * ZAR today). Plans carry their own `currency`; this is only the fallback
 * for a screen that has no plan to read it from.
 */
export const CATALOG_CURRENCY = 'ZAR';

/** The catalogue currency from any plan in the list (they share one). */
export function planCurrency(
  plans: readonly { currency: string }[] | undefined,
): string {
  return plans?.[0]?.currency ?? CATALOG_CURRENCY;
}

/** What the usage card needs, with the arithmetic done once. */
export interface UsageView {
  state: UsageState;
  /** False when the plan has no allowance to measure against. */
  hasAllowance: boolean;
  used: number;
  limit: number;
  /** 0 to 100, for the bar: never past full, even when over. */
  fillPercent: number;
  extraJobs: number;
  extraCostCents: number;
}

export function usageView(usage: BillingUsageDTO): UsageView {
  const limit = usage.included_jobs ?? 0;
  const hasAllowance = usage.included_jobs !== null;
  const raw = hasAllowance
    ? (usage.usage_percent ??
      (limit > 0 ? Math.floor((usage.completed_jobs / limit) * 100) : 0))
    : 0;
  return {
    state: usage.usage_state,
    hasAllowance,
    used: usage.completed_jobs,
    limit,
    fillPercent: Math.max(0, Math.min(100, raw)),
    extraJobs: usage.extra_jobs,
    extraCostCents: usage.extra_cost_cents,
  };
}

/** "1 Nov": the day the job count starts again. */
export function resetsLabel(resetsOn: string): string {
  return formatDayMonth(resetsOn);
}

/** R4 per extra completed job on every paid plan (docs/BUILD_PLAN.md); used only when the usage has no extras to derive it from. */
export const DEFAULT_EXTRA_JOB_CENTS = 400;

/** What one extra job costs, from the usage itself when it has extras. */
export function extraJobRateCents(usage: BillingUsageDTO): number {
  return usage.extra_jobs > 0
    ? Math.round(usage.extra_cost_cents / usage.extra_jobs)
    : DEFAULT_EXTRA_JOB_CENTS;
}
