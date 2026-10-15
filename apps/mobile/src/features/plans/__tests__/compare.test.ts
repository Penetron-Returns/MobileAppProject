import type { PlanDTO } from '@booking/types';

import { comparisonRows, lowestPaidPriceCents, paidPlans } from '../compare';

function plan(id: PlanDTO['id'], over: Partial<PlanDTO> = {}): PlanDTO {
  return {
    id,
    name: id,
    price_cents: 0,
    currency: 'ZAR',
    included_jobs: null,
    extra_job_cents: null,
    has_companion: false,
    is_current: false,
    checkout_url: null,
    ...over,
  };
}

const PLANS = [
  plan('free'),
  plan('starter', {
    price_cents: 20000,
    included_jobs: 50,
    extra_job_cents: 400,
    has_companion: true,
  }),
  plan('growth', {
    price_cents: 40000,
    included_jobs: 100,
    extra_job_cents: 400,
    has_companion: true,
  }),
  plan('pro', {
    price_cents: 80000,
    included_jobs: 200,
    extra_job_cents: 400,
    has_companion: true,
  }),
];

describe('comparisonRows', () => {
  const rows = comparisonRows(PLANS);
  const cells = (key: string) =>
    rows.find((r) => r.key === key)?.cells.map((c) => c.text);
  const tones = (key: string) =>
    rows.find((r) => r.key === key)?.cells.map((c) => c.tone);

  it('takes prices and allowances from the plan list', () => {
    expect(cells('price')).toEqual(['R0', 'R200', 'R400', 'R800']);
    expect(cells('jobs')).toEqual(['–', '50', '100', '200']);
    expect(cells('extra')).toEqual(['–', 'R4', 'R4', 'R4']);
  });

  it('gives Free the inbox and paid plans the companion and reports', () => {
    expect(tones('inbox')).toEqual(['yes', 'no', 'no', 'no']);
    expect(tones('companion')).toEqual(['no', 'yes', 'yes', 'yes']);
    expect(tones('reports')).toEqual(['no', 'yes', 'yes', 'yes']);
    expect(tones('manual')).toEqual(['yes', 'yes', 'yes', 'yes']);
  });
});

describe('paid plan helpers', () => {
  it('lists only the plans with the companion', () => {
    expect(paidPlans(PLANS).map((p) => p.id)).toEqual([
      'starter',
      'growth',
      'pro',
    ]);
  });
  it('finds the lowest paid price, or null without paid plans', () => {
    expect(lowestPaidPriceCents(PLANS)).toBe(20000);
    expect(lowestPaidPriceCents([plan('free')])).toBeNull();
  });
});
