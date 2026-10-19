import type { BillingUsageDTO, FeatureEntitlementDTO } from '@booking/types';

import {
  DEFAULT_EXTRA_JOB_CENTS,
  extraJobRateCents,
  hasFeature,
  monthlyLimit,
  resetsLabel,
  usageView,
  planCurrency,
} from '../logic';

const growth: FeatureEntitlementDTO[] = [
  { feature: 'companion', monthly_limit: null },
  { feature: 'desktop_app', monthly_limit: null },
  { feature: 'assistant_bookings', monthly_limit: 250 },
];

describe('hasFeature', () => {
  it('is true only for features in the list', () => {
    expect(hasFeature(growth, 'companion')).toBe(true);
    expect(hasFeature(growth, 'assistant_bookings')).toBe(true);
    expect(hasFeature(growth, 'inbox')).toBe(false);
    expect(hasFeature(growth, 'whatsapp_menu')).toBe(false);
  });

  it('fails closed when entitlements are not loaded or empty', () => {
    expect(hasFeature(undefined, 'inbox')).toBe(false);
    expect(hasFeature([], 'inbox')).toBe(false);
  });
});

describe('monthlyLimit', () => {
  it('returns the cap when set', () => {
    expect(monthlyLimit(growth, 'assistant_bookings')).toBe(250);
  });

  it('returns null for uncapped, absent and unloaded', () => {
    expect(monthlyLimit(growth, 'companion')).toBeNull();
    expect(monthlyLimit(growth, 'inbox')).toBeNull();
    expect(monthlyLimit(undefined, 'companion')).toBeNull();
  });
});

function usage(over: Partial<BillingUsageDTO> = {}): BillingUsageDTO {
  return {
    plan: 'growth',
    month: '2026-10',
    completed_jobs: 63,
    included_jobs: 100,
    usage_percent: 63,
    usage_state: 'normal',
    extra_jobs: 0,
    extra_cost_cents: 0,
    resets_on: '2026-11-01',
    ...over,
  };
}

describe('usageView', () => {
  it.each([
    ['normal', usage(), { fillPercent: 63, hasAllowance: true }],
    [
      'near',
      usage({ completed_jobs: 86, usage_percent: 86, usage_state: 'near' }),
      { fillPercent: 86, hasAllowance: true },
    ],
    [
      'over caps the bar at full',
      usage({
        completed_jobs: 104,
        usage_percent: 104,
        usage_state: 'over',
        extra_jobs: 4,
        extra_cost_cents: 1600,
      }),
      { fillPercent: 100, hasAllowance: true, extraJobs: 4 },
    ],
    [
      'free has no allowance',
      usage({
        plan: 'free',
        included_jobs: null,
        usage_percent: null,
        completed_jobs: 7,
      }),
      { fillPercent: 0, hasAllowance: false, limit: 0 },
    ],
  ])('%s', (_name, input, expected) => {
    expect(usageView(input)).toMatchObject(expected);
  });
});

describe('extraJobRateCents', () => {
  it('derives the rate from the extras when there are some', () => {
    expect(
      extraJobRateCents(usage({ extra_jobs: 4, extra_cost_cents: 1600 })),
    ).toBe(400);
  });
  it('falls back to R4 with none', () => {
    expect(extraJobRateCents(usage())).toBe(DEFAULT_EXTRA_JOB_CENTS);
  });
});

describe('resetsLabel', () => {
  it('writes the reset day as day and month', () => {
    expect(resetsLabel('2026-11-01')).toBe('1 Nov');
  });
});

describe('planCurrency', () => {
  it.each([
    [[{ currency: 'ZAR' }], 'ZAR'],
    [[{ currency: 'USD' }, { currency: 'USD' }], 'USD'],
    [[], 'ZAR'],
    [undefined, 'ZAR'],
  ])(
    'reads %j as %s (the catalogue currency when there is no plan)',
    (plans, expected) => {
      expect(planCurrency(plans)).toBe(expected);
    },
  );
});
