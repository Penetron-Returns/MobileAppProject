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

/** Which app the plan gets: Free is the research app, paid plans get the companion and reports. */
export type AppMode = 'free' | 'ai';

/** Paid plans carry `companion` or `reports`; everything else (and unloaded data) is Free. */
export function appMode(
  features: readonly FeatureEntitlementDTO[] | undefined,
): AppMode {
  return hasFeature(features, 'companion') || hasFeature(features, 'reports')
    ? 'ai'
    : 'free';
}

/**
 * Rand from integer cents, as the plan boards write it: "R200", "R16",
 * "R1,250", and "R4.50" only when there are cents.
 */
export function formatRand(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const rand = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(rand).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}R${grouped}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** What the usage card needs, with the arithmetic done once. */
export interface UsageView {
  state: UsageState;
  /** False on Free: there is no allowance to measure against. */
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
