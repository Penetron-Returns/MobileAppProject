/** Builds BillingConfig from environment variables (a structural slice, not the app's Env). */
import type { BillingConfig } from '../ports.ts';

export interface BillingEnv {
  readonly STRIPE_PRICE_STARTER?: string | undefined;
  readonly STRIPE_PRICE_GROWTH?: string | undefined;
  readonly STRIPE_PRICE_PRO?: string | undefined;
  readonly STRIPE_PRICE_STARTER_USD?: string | undefined;
  readonly STRIPE_PRICE_GROWTH_USD?: string | undefined;
  readonly STRIPE_PRICE_PRO_USD?: string | undefined;
  readonly STRIPE_PRICE_STARTER_USAGE?: string | undefined;
  readonly STRIPE_PRICE_GROWTH_USAGE?: string | undefined;
  readonly STRIPE_PRICE_PRO_USAGE?: string | undefined;
  readonly STRIPE_METER_EVENT_NAME?: string | undefined;
  readonly BILLING_SUCCESS_URL?: string | undefined;
  readonly BILLING_CANCEL_URL?: string | undefined;
  readonly BILLING_RETURN_URL?: string | undefined;
}

const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;

/** Null unless both return URLs are set: checkout cannot send the owner anywhere without them. */
export function billingConfigFromEnv(env: BillingEnv): BillingConfig | null {
  const successUrl = clean(env.BILLING_SUCCESS_URL);
  const cancelUrl = clean(env.BILLING_CANCEL_URL);
  if (!successUrl || !cancelUrl) return null;
  return {
    prices: {
      starter: { ZAR: clean(env.STRIPE_PRICE_STARTER), USD: clean(env.STRIPE_PRICE_STARTER_USD) },
      growth: { ZAR: clean(env.STRIPE_PRICE_GROWTH), USD: clean(env.STRIPE_PRICE_GROWTH_USD) },
      pro: { ZAR: clean(env.STRIPE_PRICE_PRO), USD: clean(env.STRIPE_PRICE_PRO_USD) },
    },
    usagePrices: {
      starter: { ZAR: clean(env.STRIPE_PRICE_STARTER_USAGE) },
      growth: { ZAR: clean(env.STRIPE_PRICE_GROWTH_USAGE) },
      pro: { ZAR: clean(env.STRIPE_PRICE_PRO_USAGE) },
    },
    meterEventName: clean(env.STRIPE_METER_EVENT_NAME) ?? 'booking_made',
    successUrl,
    cancelUrl,
    returnUrl: clean(env.BILLING_RETURN_URL) ?? successUrl,
  };
}
