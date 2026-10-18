/** Pure billing policy: which price is which plan, and which subscription states keep a business entitled. */
import type { PlanKey, SubscriptionStatus } from '@booking/types';
import type { BillingConfig, BillingCurrency, PaidPlan } from '../ports.ts';

export const PAID_PLANS: readonly PaidPlan[] = ['starter', 'growth', 'pro'];

export const isPaidPlan = (value: unknown): value is PaidPlan => typeof value === 'string' && (PAID_PLANS as readonly string[]).includes(value);

export function priceIdFor(config: BillingConfig, plan: PaidPlan, currency: BillingCurrency): string | null {
  return config.prices[plan]?.[currency] || null;
}

/** Maps a Stripe price id back to its plan, whatever the currency. Null for a price we do not know. */
export function planForPrice(config: BillingConfig, priceId: string | null): PaidPlan | null {
  if (!priceId) return null;
  for (const plan of PAID_PLANS) {
    if (Object.values(config.prices[plan] ?? {}).includes(priceId)) return plan;
  }
  return null;
}

/** True when `priceId` is one of the metered usage prices (of any plan) */
export function isUsagePrice(config: BillingConfig, priceId: string | null): boolean {
  return priceId !== null && PAID_PLANS.some((plan) => Object.values(config.usagePrices[plan] ?? {}).includes(priceId));
}

/** The metered price that belongs to a plan, or null when it is not configured */
export function usagePriceFor(config: BillingConfig, plan: PaidPlan, currency: BillingCurrency): string | null {
  return config.usagePrices[plan]?.[currency] || null;
}

/** Stripe accepts meter events up to 35 days old; stay a day inside it */
export const REPORT_HORIZON_MS = 34 * 24 * 60 * 60 * 1000;

/**
 * What a subscription status does to access:
 *  - active, trialing: entitled
 *  - past_due: STILL entitled. Stripe retries the card for days; cutting a salon off mid-retry punishes a bounced card.
 *    The app shows a warning from `is_past_due`.
 *  - canceled, unpaid, incomplete_expired, paused: not entitled (plan goes back to 'none')
 *  - incomplete: the first payment has not completed; leave the plan as it is
 */
export type AccessDecision = 'entitled' | 'revoked' | 'unchanged';

export function accessFor(status: SubscriptionStatus): AccessDecision {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'entitled';
    case 'incomplete':
      return 'unchanged';
    default:
      return 'revoked';
  }
}

/** The plans that unlock the companion (mirrors plan_features): the transition into one of them is the first activation. */
export const isCompanionPlan = (plan: PlanKey): boolean => isPaidPlan(plan);

/** `YYYY-MM` one calendar month before `month` */
export function previousMonth(month: string): string {
  const [year = 0, mon = 1] = month.split('-').map(Number);
  return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
}

const TIER: Readonly<Record<PaidPlan, number>> = { starter: 0, growth: 1, pro: 2 };

/** Direction of a plan change by tier order starter < growth < pro */
export function changeDirection(from: PaidPlan, to: PaidPlan): 'upgrade' | 'downgrade' | 'same' {
  const delta = TIER[to] - TIER[from];
  return delta === 0 ? 'same' : delta > 0 ? 'upgrade' : 'downgrade';
}

/** A preview's proration date may be reused for this long; after that the owner must look at a fresh amount */
export const PRORATION_DATE_MAX_AGE_SECONDS = 15 * 60;
