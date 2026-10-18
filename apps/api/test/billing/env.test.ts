import { describe, expect, it } from 'vitest';

import { billingConfigFromEnv } from '@booking/features/billing/lib/config.ts';
import { getEnv } from '../../src/env.ts';

describe('billing env parsing', () => {
  it('keeps usage price ids and meter event name through the env parser so checkout sees them', () => {
    const env = getEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      BILLING_SUCCESS_URL: 'https://app.example/success',
      BILLING_CANCEL_URL: 'https://app.example/cancel',
      STRIPE_PRICE_STARTER_USAGE: 'price_starter_usage',
      STRIPE_PRICE_GROWTH_USAGE: 'price_growth_usage',
      STRIPE_PRICE_PRO_USAGE: 'price_pro_usage',
      STRIPE_METER_EVENT_NAME: 'custom_meter',
    });
    const config = billingConfigFromEnv(env);
    expect(config?.usagePrices).toEqual({
      starter: { ZAR: 'price_starter_usage' },
      growth: { ZAR: 'price_growth_usage' },
      pro: { ZAR: 'price_pro_usage' },
    });
    expect(config?.meterEventName).toBe('custom_meter');
  });
});
