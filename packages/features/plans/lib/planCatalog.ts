/**
 * The plan catalogue: what each plan costs and how many completed jobs it includes. Display names, prices and
 * allowances live here (not in the database); which FEATURES a plan unlocks stays in `plan_features`.
 * Free is the research app (no AI companion), so it has no allowance and no overage price. 'none' is a business
 * that has not subscribed yet: it is never listed in PLAN_ORDER.
 */
import type { PlanKey } from '@booking/types';

export interface PlanCatalogEntry {
  id: PlanKey;
  name: string;
  /** Monthly price in cents (ZAR) */
  priceCents: number;
  /** Completed jobs included per month; null = no AI companion, nothing to meter */
  includedJobs: number | null;
  /** Each completed job beyond the allowance, billed at month end; null on Free */
  extraJobCents: number | null;
}

/** R4 per completed job beyond the allowance */
export const EXTRA_JOB_CENTS = 400;
/** Usage is `near` from this percent of the allowance */
export const NEAR_LIMIT_PERCENT = 80;
export const PLAN_CURRENCY = 'ZAR';

export const PLAN_CATALOG: Readonly<Record<PlanKey, PlanCatalogEntry>> = {
  none: { id: 'none', name: 'No plan', priceCents: 0, includedJobs: null, extraJobCents: null },
  free: { id: 'free', name: 'Free', priceCents: 0, includedJobs: null, extraJobCents: null },
  starter: { id: 'starter', name: 'Starter', priceCents: 20000, includedJobs: 50, extraJobCents: EXTRA_JOB_CENTS },
  growth: { id: 'growth', name: 'Growth', priceCents: 40000, includedJobs: 100, extraJobCents: EXTRA_JOB_CENTS },
  pro: { id: 'pro', name: 'Pro', priceCents: 80000, includedJobs: 200, extraJobCents: EXTRA_JOB_CENTS },
};

/** Catalogue order: cheapest first */
export const PLAN_ORDER: readonly PlanKey[] = ['free', 'starter', 'growth', 'pro'];
