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
  readonly CHECKOUT_PAGE_URL?: string | undefined;
  readonly CHECKOUT_ALLOWED_ORIGINS?: string | undefined;
}

const clean = (value: string | undefined): string | undefined => value?.trim() || undefined;

/** Null unless checkout can send the owner somewhere: the embedded page URL, or both hosted return URLs. */
export function billingConfigFromEnv(env: BillingEnv): BillingConfig | null {
  const successUrl = clean(env.BILLING_SUCCESS_URL);
  const cancelUrl = clean(env.BILLING_CANCEL_URL);
  const checkoutPageUrl = clean(env.CHECKOUT_PAGE_URL)?.replace(/\/+$/, '');
  if (!checkoutPageUrl && (!successUrl || !cancelUrl)) return null;
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
    successUrl: successUrl ?? '',
    cancelUrl: cancelUrl ?? '',
    returnUrl: clean(env.BILLING_RETURN_URL) ?? successUrl ?? checkoutPageUrl ?? '',
    checkoutPageUrl,
  };
}

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/** CORS allowlist for the public confirm route: CHECKOUT_ALLOWED_ORIGINS, else the checkout page origin plus localhost:3000. */
export function checkoutAllowedOrigins(env: BillingEnv): string[] {
  const listed = (clean(env.CHECKOUT_ALLOWED_ORIGINS) ?? '')
    .split(',')
    .map((o) => originOf(o.trim()))
    .filter((o): o is string => o !== null);
  if (listed.length > 0) return listed;
  const page = clean(env.CHECKOUT_PAGE_URL);
  return [...new Set([page ? originOf(page) : null, 'http://localhost:3000'].filter((o): o is string => o !== null))];
}
