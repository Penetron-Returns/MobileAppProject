import { describe, expect, it } from 'vitest';

import type { PlanKey } from '@booking/types';
import { PLAN_CATALOG, PLAN_ORDER } from '@booking/features/plans/lib/planCatalog.ts';
import { calendarPeriod, computeUsage, currentMonth, isMonthKey, nextMonthStart } from '@booking/features/plans/lib/usage.ts';
import { createUsageService } from '@booking/features/plans/services/usage.ts';
import { parseMonthStats } from '@booking/features/plans/services/planRepository.ts';
import { createMemoryPlanRepository } from '@booking/testing/plans.ts';
import { appt, BIZ, NOW } from './harness.ts';

describe('plan catalogue', () => {
  it('prices the paid plans R200/R400/R800 with 50/100/200 jobs and R4 extra jobs', () => {
    expect(PLAN_ORDER).toEqual(['free', 'starter', 'growth', 'pro']);
    expect(PLAN_CATALOG.starter).toMatchObject({ priceCents: 20000, includedJobs: 50, extraJobCents: 400 });
    expect(PLAN_CATALOG.growth).toMatchObject({ priceCents: 40000, includedJobs: 100, extraJobCents: 400 });
    expect(PLAN_CATALOG.pro).toMatchObject({ priceCents: 80000, includedJobs: 200, extraJobCents: 400 });
  });

  it('gives Free no allowance, no overage and no price', () => {
    expect(PLAN_CATALOG.free).toMatchObject({ priceCents: 0, includedJobs: null, extraJobCents: null });
  });
});

describe('computeUsage', () => {
  // [plan, completed jobs, percent, state, extra jobs, extra cost]
  const table: [PlanKey, number, number, string, number, number][] = [
    ['growth', 0, 0, 'normal', 0, 0],
    ['growth', 79, 79, 'normal', 0, 0],
    ['growth', 80, 80, 'near', 0, 0],
    ['growth', 99, 99, 'near', 0, 0],
    ['growth', 100, 100, 'near', 0, 0],
    ['growth', 101, 101, 'over', 1, 400],
    ['growth', 150, 150, 'over', 50, 20000],
    ['starter', 39, 78, 'normal', 0, 0],
    ['starter', 40, 80, 'near', 0, 0],
    ['starter', 50, 100, 'near', 0, 0],
    ['starter', 51, 102, 'over', 1, 400],
    ['pro', 159, 79, 'normal', 0, 0],
    ['pro', 160, 80, 'near', 0, 0],
    ['pro', 201, 100, 'over', 1, 400],
  ];

  it.each(table)('%s with %i completed jobs -> %i%% (%s), %i extra, %i cents', (plan, jobs, percent, state, extraJobs, extraCost) => {
    expect(computeUsage(plan, jobs)).toMatchObject({
      usage_percent: percent,
      usage_state: state,
      extra_jobs: extraJobs,
      extra_cost_cents: extraCost,
    });
  });

  it('floors the percentage instead of rounding it up to a state it has not reached', () => {
    // 79.9% must not read as 80%
    expect(computeUsage('pro', 159).usage_percent).toBe(79);
    expect(computeUsage('starter', 49).usage_percent).toBe(98);
  });

  it('never meters Free: no allowance, no percentage, no cost, whatever the count', () => {
    expect(computeUsage('free', 500)).toEqual({ included_jobs: null, usage_percent: null, usage_state: 'normal', extra_jobs: 0, extra_cost_cents: 0 });
  });

  it('treats a negative count as zero', () => {
    expect(computeUsage('starter', -3)).toMatchObject({ usage_percent: 0, usage_state: 'normal' });
  });
});

describe('month helpers', () => {
  it.each([
    ['2026-10', true],
    ['2026-12', true],
    ['2026-00', false],
    ['2026-13', false],
    ['2026-1', false],
    ['26-10', false],
    ['2026-10-01', false],
  ])('isMonthKey(%s) = %s', (value, expected) => expect(isMonthKey(value)).toBe(expected));

  it('resets on the first of the next month, across the year end', () => {
    expect(nextMonthStart('2026-10')).toBe('2026-11-01');
    expect(nextMonthStart('2026-12')).toBe('2027-01-01');
    expect(nextMonthStart('2026-02')).toBe('2026-03-01');
  });

  it('reads the current month in the business timezone, not UTC', () => {
    const lastMinuteUtc = new Date('2026-10-31T22:30:00.000Z'); // 00:30 on 1 Nov in Johannesburg (UTC+2)
    expect(currentMonth(lastMinuteUtc, 'Africa/Johannesburg')).toBe('2026-11');
    expect(currentMonth(lastMinuteUtc, 'UTC')).toBe('2026-10');
    expect(currentMonth(new Date('2026-12-31T23:30:00.000Z'), 'Africa/Johannesburg')).toBe('2027-01');
  });
});

describe('bookings created (in-memory repository, mirrors the SQL count)', () => {
  const repo = (appointments = [] as ReturnType<typeof appt>[]) => createMemoryPlanRepository({ [BIZ]: { plan: 'growth' } }, appointments);
  const created = (iso: string, over: Partial<ReturnType<typeof appt>> = {}) => ({ ...appt('2026-12-01T09:00'), createdAt: iso, ...over });
  const count = (r: ReturnType<typeof repo>, from: string, to: string) => r.countBookingsCreated(BIZ, new Date(from), new Date(to));

  it('counts every booking by creation time, whatever its status or source', async () => {
    const r = repo([
      created('2026-10-02T09:00:00Z', { status: 'confirmed' }),
      created('2026-10-03T09:00:00Z', { status: 'completed' }),
      created('2026-10-04T09:00:00Z', { status: 'cancelled' }),
      created('2026-10-05T09:00:00Z', { status: 'no_show' }),
      created('2026-10-06T09:00:00Z', { source: 'whatsapp' }),
      created('2026-10-07T09:00:00Z', { source: 'nerova' }),
      created('2026-10-08T09:00:00Z', { source: 'web' }),
    ]);
    expect(await count(r, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')).toBe(7);
  });

  it('does not depend on when the appointment takes place, only on when it was made', async () => {
    const r = repo([created('2026-09-30T10:00:00Z', { startsAt: '2026-10-15T08:00:00.000Z', endsAt: '2026-10-15T09:00:00.000Z' })]);
    expect(await count(r, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')).toBe(0);
    expect(await count(r, '2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')).toBe(1);
  });

  it('is inclusive at the period start and exclusive at its end', async () => {
    const r = repo([created('2026-10-01T00:00:00Z'), created('2026-11-01T00:00:00Z')]);
    expect(await count(r, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')).toBe(1);
  });

  it('only counts the business\'s own bookings', async () => {
    const r = repo([created('2026-10-02T09:00:00Z'), created('2026-10-02T09:00:00Z', { businessId: '00000000-0000-4000-8000-0000000000bb' })]);
    expect(await count(r, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')).toBe(1);
  });
});

describe('UsageService', () => {
  type Appt = ReturnType<typeof appt>;
  const made = (iso: string, over: Partial<Appt> = {}): Appt => ({ ...appt('2026-12-01T09:00'), createdAt: iso, ...over });
  function service(plan: PlanKey, appointments: Appt[], timezone = 'Africa/Johannesburg', now = NOW, periodEnd: string | null = null) {
    const repo = createMemoryPlanRepository({ [BIZ]: { plan, timezone } }, appointments);
    const billing = {
      isCheckoutAvailable: () => false,
      getSubscription: async () =>
        periodEnd ? { status: 'active' as const, plan: 'growth' as const, current_period_end: periodEnd, cancel_at_period_end: false, is_past_due: false } : null,
    };
    return createUsageService({ repo, clock: () => now, billing });
  }

  it('defaults to the current calendar month without a subscription and reports the reset date', async () => {
    const usage = await service('growth', [made('2026-10-05T07:00:00Z')]).getUsage(BIZ);
    expect(usage).toEqual({
      plan: 'growth',
      month: '2026-10',
      completed_jobs: 1,
      bookings: 1,
      period_start: '2026-09-30T22:00:00.000Z',
      period_end: '2026-10-31T22:00:00.000Z',
      included_jobs: 100,
      usage_percent: 1,
      usage_state: 'normal',
      extra_jobs: 0,
      extra_cost_cents: 0,
      resets_on: '2026-11-01',
    });
  });

  it('counts cancelled and no-show bookings against the allowance', async () => {
    const usage = await service('starter', [
      made('2026-10-02T07:00:00Z'),
      made('2026-10-03T07:00:00Z', { status: 'cancelled' }),
      made('2026-10-04T07:00:00Z', { status: 'no_show' }),
      made('2026-10-05T07:00:00Z', { status: 'completed' }),
    ]).getUsage(BIZ);
    expect(usage).toMatchObject({ bookings: 4, usage_percent: 8 });
  });

  it('prices bookings over the allowance at R4 each and never refuses them', async () => {
    const many = Array.from({ length: 52 }, (_, i) => made(`2026-10-${String(1 + (i % 12)).padStart(2, '0')}T${String(6 + Math.floor(i / 12)).padStart(2, '0')}:00:00Z`));
    const usage = await service('starter', many, undefined, new Date('2026-10-13T20:00:00.000Z')).getUsage(BIZ, '2026-10');
    expect(usage).toMatchObject({ bookings: 52, usage_state: 'over', extra_jobs: 2, extra_cost_cents: 800 });
  });

  it('starts warning at 80% of the allowance', async () => {
    const jobs = (n: number) => Array.from({ length: n }, (_, i) => made(`2026-10-02T0${i % 9}:00:00Z`));
    expect((await service('starter', jobs(39)).getUsage(BIZ)).usage_state).toBe('normal');
    expect((await service('starter', jobs(40)).getUsage(BIZ)).usage_state).toBe('near');
  });

  it('uses the Stripe billing period when a subscription is known, so the app matches the invoice', async () => {
    // Renews on the 20th: the period is 20 Sep 12:00 SAST to 20 Oct 12:00 SAST. NOW is 13 Oct.
    const end = '2026-10-20T10:00:00.000Z';
    const usage = await service(
      'growth',
      [
        made('2026-09-20T09:59:59Z'), // one second before the period: last period's
        made('2026-09-20T10:00:00Z'), // first instant of the period
        made('2026-10-13T08:00:00Z'),
        made('2026-10-20T10:00:00Z'), // first instant of the next period
      ],
      undefined,
      NOW,
      end,
    ).getUsage(BIZ);
    expect(usage).toMatchObject({ bookings: 2, period_start: '2026-09-20T10:00:00.000Z', period_end: end, resets_on: '2026-10-20', month: '2026-09' });
  });

  it('falls back to the calendar month when the stored period already ended (a missed webhook)', async () => {
    const usage = await service('growth', [made('2026-10-05T07:00:00Z')], undefined, NOW, '2026-10-01T10:00:00.000Z').getUsage(BIZ);
    expect(usage).toMatchObject({ bookings: 1, month: '2026-10', resets_on: '2026-11-01' });
  });

  it('draws the calendar month edge at local midnight in the business timezone', async () => {
    // 22:00Z on 31 Oct is midnight on 1 Nov in Johannesburg (UTC+2)
    const rows = [made('2026-10-31T21:59:59Z'), made('2026-10-31T22:00:00Z')];
    expect(await service('growth', rows, 'Africa/Johannesburg', NOW).getUsage(BIZ, '2026-10')).toMatchObject({ bookings: 1 });
    expect(await service('growth', rows, 'Africa/Johannesburg', NOW).getUsage(BIZ, '2026-11')).toMatchObject({ bookings: 1 });
    // West of UTC: 04:00Z on 1 Nov is midnight on 1 Nov in New York in November (UTC-5 after the DST change on 1 Nov 06:00Z), 04:00Z in October (EDT UTC-4)
    const ny = [made('2026-11-01T03:59:59Z'), made('2026-11-01T04:00:00Z')];
    expect(await service('growth', ny, 'America/New_York', NOW).getUsage(BIZ, '2026-10')).toMatchObject({ bookings: 1 });
  });

  it('adds a calendar month, not 30 days, across a DST change', async () => {
    const period = calendarPeriod('2026-03', 'America/New_York');
    expect(period.start.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-04-01T04:00:00.000Z');
  });

  it('rejects a malformed month and an unknown business', async () => {
    await expect(service('growth', []).getUsage(BIZ, '2026-13')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(service('growth', []).getUsage('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('marks the current plan in the catalogue and leaves checkout_url null', async () => {
    const { current_plan, plans } = await service('growth', []).listPlans(BIZ);
    expect(current_plan).toBe('growth');
    expect(plans.map((p) => [p.id, p.is_current])).toEqual([['free', false], ['starter', false], ['growth', true], ['pro', false]]);
    expect(plans.every((p) => p.checkout_url === null && p.currency === 'ZAR')).toBe(true);
    expect(plans.find((p) => p.id === 'free')).toMatchObject({ has_companion: false, included_jobs: null, extra_job_cents: null, price_cents: 0 });
    expect(plans.find((p) => p.id === 'pro')).toMatchObject({ has_companion: true, included_jobs: 200, extra_job_cents: 400, price_cents: 80000 });
  });

  it('a business with no plan yet has no allowance and is not listed as a plan', async () => {
    const usage = await service('none', [made('2026-10-05T07:00:00Z')]).getUsage(BIZ);
    expect(usage).toMatchObject({ plan: 'none', included_jobs: null, usage_state: 'normal', extra_cost_cents: 0 });
    expect((await service('none', []).listPlans(BIZ)).plans.map((p) => p.id)).not.toContain('none');
  });
});

describe('parseMonthStats', () => {
  it('narrows the month_report jsonb, defaulting what is missing', () => {
    expect(parseMonthStats({})).toEqual({
      completed_jobs: 0,
      revenue_cents: 0,
      bookings_created: { whatsapp: 0, nerova: 0, app: 0, web: 0 },
      no_shows: 0,
      cancellations: 0,
      busiest: null,
      weekly: [],
    });
    expect(
      parseMonthStats({
        completed_jobs: 5,
        revenue_cents: 225000,
        bookings_created: { whatsapp: 2, nerova: 1, app: 3, web: 1 },
        no_shows: 1,
        cancellations: 1,
        busiest: { weekday: 1, hour: 9 },
        weekly: [{ week_start: '2031-02-24', completed_jobs: 1 }],
      }),
    ).toMatchObject({ completed_jobs: 5, busiest: { weekday: 1, hour: 9 }, weekly: [{ week_start: '2031-02-24', completed_jobs: 1 }] });
  });
});
