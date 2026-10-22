import { describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.ts';
import type { ClerkClaims } from '../../src/middleware/auth.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { currentMonth, isMonthKey, monthStart } from '@booking/features/reports/lib/month.ts';
import { parseMonthStats } from '@booking/features/reports/services/reportRepository.ts';
import { createReportService } from '@booking/features/reports/services/reports.ts';
import { createMemoryReportRepository, type MemoryAppointment } from '@booking/testing/reportsMemory.ts';
import { memoryIdempotencyStore, testContainer } from '../helpers.ts';

const BIZ = '10000000-0000-4000-8000-0000000000aa';
/** Tuesday 2026-10-13 12:00 SAST */
const NOW = new Date('2026-10-13T10:00:00.000Z');

/** SAST wall-clock start, 60 minutes long, a completed 'app' booking worth R250 unless overridden. */
function appt(startLocal: string, over: Partial<MemoryAppointment> & { minutes?: number } = {}): MemoryAppointment {
  const startsAt = new Date(`${startLocal}:00+02:00`);
  const endsAt = new Date(startsAt.getTime() + (over.minutes ?? 60) * 60_000);
  return {
    businessId: BIZ,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'completed',
    source: 'app',
    priceCents: 25000,
    createdAt: startsAt.toISOString(),
    ...over,
  };
}

function service(appointments: MemoryAppointment[], timezone = 'Africa/Johannesburg', now = NOW) {
  const repo = createMemoryReportRepository({ [BIZ]: { timezone, currency: 'ZAR' } }, appointments);
  return createReportService({ repo, clock: () => now });
}

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

  it('reads the current month in the business timezone, not UTC', () => {
    const lastMinuteUtc = new Date('2026-10-31T22:30:00.000Z'); // 00:30 on 1 Nov in Johannesburg (UTC+2)
    expect(currentMonth(lastMinuteUtc, 'Africa/Johannesburg')).toBe('2026-11');
    expect(currentMonth(lastMinuteUtc, 'UTC')).toBe('2026-10');
    expect(currentMonth(new Date('2026-12-31T23:30:00.000Z'), 'Africa/Johannesburg')).toBe('2027-01');
  });

  it('starts a month on the first day', () => expect(monthStart('2026-10')).toBe('2026-10-01'));
});

describe('ReportService', () => {
  it('sums completed jobs and revenue for the current month by default', async () => {
    const report = await service([
      appt('2026-10-02T09:00'),
      appt('2026-10-05T10:00', { priceCents: 10000 }),
      appt('2026-09-30T10:00'), // last month
    ]).getReport(BIZ);
    expect(report).toMatchObject({ month: '2026-10', currency: 'ZAR', completed_jobs: 2, revenue_cents: 35000 });
  });

  it('does not count cancelled, no-show or still-future appointments as completed jobs', async () => {
    const report = await service([
      appt('2026-10-02T09:00', { status: 'cancelled' }),
      appt('2026-10-03T09:00', { status: 'no_show' }),
      appt('2026-10-20T09:00', { status: 'confirmed' }), // ends after NOW
      appt('2026-10-04T09:00'),
    ]).getReport(BIZ);
    expect(report).toMatchObject({ completed_jobs: 1, revenue_cents: 25000, no_shows: 1, cancellations: 1 });
  });

  it('counts bookings created by source, with staff-made bookings as manual', async () => {
    const report = await service([
      appt('2026-10-02T09:00', { source: 'whatsapp' }),
      appt('2026-10-03T09:00', { source: 'whatsapp' }),
      appt('2026-10-04T09:00', { source: 'web' }),
      appt('2026-10-05T09:00', { source: 'app' }),
    ]).getReport(BIZ);
    expect(report.bookings_created).toEqual({ whatsapp: 2, manual: 1, web: 1 });
  });

  it('does not expose companion or usage figures', async () => {
    const report = await service([]).getReport(BIZ);
    expect(Object.keys(report).sort()).toEqual(
      ['bookings_created', 'busiest', 'cancellations', 'completed_jobs', 'currency', 'month', 'no_shows', 'revenue_cents', 'weekly'].sort(),
    );
    expect(report.busiest).toBeNull();
  });

  it('finds the busiest weekday and hour in the business timezone', async () => {
    const report = await service([appt('2026-10-05T09:00'), appt('2026-10-12T09:30'), appt('2026-10-06T14:00')]).getReport(BIZ);
    expect(report.busiest).toEqual({ weekday: 1, hour: 9 }); // Mondays at 09:xx, 0 = Sunday
  });

  it('draws the month edge at local midnight in the business timezone', async () => {
    // a job is reported in the month it ends: 00:30 on 1 Nov in Johannesburg (UTC+2) belongs to November
    const rows = [appt('2026-10-31T23:45', { minutes: 45 }), appt('2026-10-31T21:00', { minutes: 30 })];
    const later = new Date('2026-11-20T10:00:00Z');
    const nov = await service(rows, 'Africa/Johannesburg', later).getReport(BIZ, '2026-11');
    const oct = await service(rows, 'Africa/Johannesburg', later).getReport(BIZ, '2026-10');
    expect([oct.completed_jobs, nov.completed_jobs]).toEqual([1, 1]);
  });

  it('splits the month into Monday-start weeks', async () => {
    const report = await service([appt('2026-10-05T09:00'), appt('2026-10-07T09:00'), appt('2026-10-12T09:00')]).getReport(BIZ, '2026-10');
    expect(report.weekly.find((w) => w.week_start === '2026-10-05')).toEqual({ week_start: '2026-10-05', completed_jobs: 2 });
    expect(report.weekly.find((w) => w.week_start === '2026-10-12')).toEqual({ week_start: '2026-10-12', completed_jobs: 1 });
  });

  it('only counts the appointments of the requested business', async () => {
    const other = '00000000-0000-4000-8000-0000000000bb';
    const report = await service([appt('2026-10-02T09:00'), appt('2026-10-02T10:00', { businessId: other })]).getReport(BIZ);
    expect(report.completed_jobs).toBe(1);
  });

  it('rejects a malformed month and an unknown business', async () => {
    await expect(service([]).getReport(BIZ, '2026-13')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(service([]).getReport('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('parseMonthStats', () => {
  it('narrows the month_report jsonb, defaulting what is missing', () => {
    expect(parseMonthStats({})).toEqual({
      completed_jobs: 0,
      revenue_cents: 0,
      bookings_created: { whatsapp: 0, app: 0, web: 0 },
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
    ).toMatchObject({
      completed_jobs: 5,
      bookings_created: { whatsapp: 2, app: 3, web: 1 },
      busiest: { weekday: 1, hour: 9 },
      weekly: [{ week_start: '2031-02-24', completed_jobs: 1 }],
    });
  });
});

describe('GET /v1/reports/summary', () => {
  const CLAIMS: Record<string, ClerkClaims> = {
    owner: { sub: 'user_owner', org_id: 'org_reports', org_role: 'org:admin' },
    staff: { sub: 'user_staff', org_id: 'org_reports', org_role: 'org:member' },
  };
  const authDb = (): Db => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: BIZ }, error: null }) };
    return { from: () => chain } as unknown as Db;
  };
  const get = (path: string, token = 'owner') => {
    const app = createApp({
      getContainer: () => testContainer({ db: authDb(), reports: service([appt('2026-10-02T09:00'), appt('2026-09-02T09:00')]) }),
      verifyToken: async (t) => CLAIMS[t] ?? Promise.reject(new Error('bad token')),
      idempotencyStore: memoryIdempotencyStore,
    });
    return app.request(path, { headers: { authorization: `Bearer ${token}` } });
  };

  it('answers the current month to the owner and to staff, with no plan gate', async () => {
    for (const token of ['owner', 'staff']) {
      const res = await get('/v1/reports/summary', token);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { data: unknown }).data).toMatchObject({ month: '2026-10', completed_jobs: 1, revenue_cents: 25000 });
    }
  });

  it('answers an explicit month', async () => {
    const res = await get('/v1/reports/summary?month=2026-09');
    expect(((await res.json()) as { data: unknown }).data).toMatchObject({ month: '2026-09', completed_jobs: 1 });
  });

  it('rejects a malformed month with 400', async () => {
    const res = await get('/v1/reports/summary?month=2026-13');
    expect(res.status).toBe(400);
  });

  it('requires a signed-in member', async () => {
    expect((await get('/v1/reports/summary', 'bad')).status).toBe(401);
  });
});
