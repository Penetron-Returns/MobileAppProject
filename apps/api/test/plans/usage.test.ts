import { describe, expect, it } from 'vitest';

import type { PlanKey } from '@booking/types';
import { PLAN_CATALOG, PLAN_ORDER } from '@booking/features/plans/lib/planCatalog.ts';
import { computeUsage, currentMonth, isMonthKey, nextMonthStart } from '@booking/features/plans/lib/usage.ts';
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

describe('completed jobs (in-memory repository, mirrors the SQL)', () => {
  const now = new Date('2026-10-20T10:00:00.000Z');
  const repo = (appointments = [] as ReturnType<typeof appt>[]) => createMemoryPlanRepository({ [BIZ]: { plan: 'growth' } }, appointments);

  it('counts an appointment once its end has passed, including one ending exactly now', async () => {
    const r = repo([appt('2026-10-20T11:00'), appt('2026-10-20T11:01')]); // ends 12:00 SAST = now; ends 12:01
    expect(await r.countCompletedJobs(BIZ, '2026-10', now)).toBe(1);
  });

  it('never counts cancelled or no-show appointments, but counts confirmed and completed ones', async () => {
    const r = repo([
      appt('2026-10-02T09:00', { status: 'confirmed' }),
      appt('2026-10-03T09:00', { status: 'completed' }),
      appt('2026-10-04T09:00', { status: 'cancelled' }),
      appt('2026-10-05T09:00', { status: 'no_show' }),
    ]);
    expect(await r.countCompletedJobs(BIZ, '2026-10', now)).toBe(2);
  });

  it('assigns a job to the month it ENDS in, in the business timezone', async () => {
    // Starts 23:30 on 31 Oct SAST (21:30Z), ends 00:30 on 1 Nov SAST: November's job, still 31 Oct in UTC.
    const lateNight = appt('2026-10-31T23:30');
    const r = repo([lateNight]);
    const later = new Date('2026-11-30T10:00:00.000Z');
    expect(await r.countCompletedJobs(BIZ, '2026-10', later)).toBe(0);
    expect(await r.countCompletedJobs(BIZ, '2026-11', later)).toBe(1);
  });

  it('draws the first-of-month edge at local midnight (22:00Z the evening before)', async () => {
    const r = repo([appt('2026-11-01T00:00', { minutes: 30 }), appt('2026-10-31T22:30', { minutes: 30 })]);
    const later = new Date('2026-11-30T10:00:00.000Z');
    expect(await r.countCompletedJobs(BIZ, '2026-10', later)).toBe(1); // ends 23:00 on 31 Oct
    expect(await r.countCompletedJobs(BIZ, '2026-11', later)).toBe(1); // ends 00:30 on 1 Nov
  });

  it('respects a business timezone west of UTC at the month edge', async () => {
    const r = createMemoryPlanRepository({ [BIZ]: { plan: 'growth', timezone: 'America/New_York' } }, [
      // 2026-11-01T03:30Z is 23:30 on 31 Oct in New York (EDT, UTC-4): October there, November in UTC.
      { ...appt('2026-11-01T05:00'), startsAt: '2026-11-01T02:30:00.000Z', endsAt: '2026-11-01T03:30:00.000Z' },
    ]);
    const later = new Date('2026-12-01T00:00:00.000Z');
    expect(await r.countCompletedJobs(BIZ, '2026-10', later)).toBe(1);
    expect(await r.countCompletedJobs(BIZ, '2026-11', later)).toBe(0);
  });
});

describe('UsageService', () => {
  function service(plan: PlanKey, appointments: ReturnType<typeof appt>[], timezone = 'Africa/Johannesburg', now = NOW) {
    const repo = createMemoryPlanRepository({ [BIZ]: { plan, timezone } }, appointments);
    return createUsageService({ repo, clock: () => now });
  }

  it('defaults to the current month and reports the reset date', async () => {
    const usage = await service('growth', [appt('2026-10-05T09:00')]).getUsage(BIZ);
    expect(usage).toEqual({
      plan: 'growth',
      month: '2026-10',
      completed_jobs: 1,
      included_jobs: 100,
      usage_percent: 1,
      usage_state: 'normal',
      extra_jobs: 0,
      extra_cost_cents: 0,
      resets_on: '2026-11-01',
    });
  });

  it('prices jobs over the allowance at R4 each and never refuses them', async () => {
    const many = Array.from({ length: 52 }, (_, i) => appt(`2026-10-${String(1 + (i % 12)).padStart(2, '0')}T${String(6 + Math.floor(i / 12) * 2).padStart(2, '0')}:00`, { minutes: 30 }));
    const usage = await service('starter', many, undefined, new Date('2026-10-13T20:00:00.000Z')).getUsage(BIZ, '2026-10');
    expect(usage).toMatchObject({ completed_jobs: 52, usage_state: 'over', extra_jobs: 2, extra_cost_cents: 800 });
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
