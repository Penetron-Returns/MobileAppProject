import { buildReport, type ReportRow } from '../aggregate';
import { reportPeriod, type ReportRange } from '../period';

const JHB = 'Africa/Johannesburg';

let seq = 0;
function row(over: Partial<ReportRow> = {}): ReportRow {
  seq += 1;
  return {
    // 10:00 in Johannesburg on 14 Oct 2026
    starts_at: '2026-10-14T08:00:00Z',
    status: 'completed',
    source: 'whatsapp',
    price_cents: 10_000,
    client_id: `c${seq}`,
    staff_id: 's1',
    staff_name: 'Thandi',
    staff_color: null,
    ...over,
  };
}

function report(
  rows: ReportRow[],
  opts: {
    range?: ReportRange;
    today?: string;
    timezone?: string;
    newClients?: string[];
  } = {},
) {
  const today = opts.today ?? '2026-10-14';
  return buildReport({
    rows,
    newClientIds: new Set(opts.newClients ?? []),
    period: reportPeriod(opts.range ?? 'month', today),
    timezone: opts.timezone ?? JHB,
  });
}

describe('buildReport with no data', () => {
  it('is zero and honest about what it cannot say', () => {
    const r = report([]);
    expect(r.revenueCents).toBe(0);
    expect(r.deltaPercent).toBeNull();
    expect(r.bookings).toBe(0);
    expect(r.noShowPercent).toBeNull();
    expect(r.returningPercent).toBeNull();
    expect(r.staff).toEqual([]);
    expect(r.sources).toEqual([]);
    expect(r.heat).toBeNull();
    expect(r.bars).toHaveLength(14);
    expect(r.bars.every((b) => b.cents === 0)).toBe(true);
  });
});

describe('revenue and bookings', () => {
  it('counts revenue from completed bookings only, in integer cents', () => {
    const r = report([
      row({ price_cents: 45_050 }),
      row({ status: 'confirmed', price_cents: 99_900 }),
      row({ status: 'no_show', price_cents: 99_900 }),
      row({ status: 'cancelled', price_cents: 99_900 }),
    ]);
    expect(r.revenueCents).toBe(45_050);
    expect(r.bookings).toBe(3);
    expect(r.bars.at(-1)).toEqual({ key: '2026-10-14', cents: 45_050 });
  });

  it('leaves out the previous period and anything after today', () => {
    const r = report([
      row({ starts_at: '2026-09-30T08:00:00Z' }),
      row({ starts_at: '2026-10-15T08:00:00Z' }),
    ]);
    expect(r.bookings).toBe(0);
  });

  it.each([
    ['up', 15_000, 10_000, 50],
    ['down', 5_000, 10_000, -50],
    ['flat', 10_000, 10_000, 0],
    ['rounded', 10_000, 30_000, -67],
  ])('compares like with like: %s', (_name, now, before, percent) => {
    // Same elapsed days: 1 to 14 Oct against 1 to 14 Sep.
    const r = report([
      row({ price_cents: now }),
      row({ starts_at: '2026-09-10T08:00:00Z', price_cents: before }),
      // Outside the compared span (15 Sep onwards) so it must not count.
      row({ starts_at: '2026-09-20T08:00:00Z', price_cents: 1_000_000 }),
    ]);
    expect(r.deltaPercent).toBe(percent);
  });

  it('has no delta when the previous period earned nothing', () => {
    expect(report([row()]).deltaPercent).toBeNull();
  });
});

describe('days in the business timezone', () => {
  it('puts a booking just after local midnight on the next day', () => {
    const r = report(
      [
        row({ starts_at: '2026-10-14T21:59:00Z', price_cents: 100 }),
        row({ starts_at: '2026-10-14T22:30:00Z', price_cents: 200 }),
      ],
      { today: '2026-10-15' },
    );
    const byKey = Object.fromEntries(r.bars.map((b) => [b.key, b.cents]));
    expect(byKey['2026-10-14']).toBe(100);
    expect(byKey['2026-10-15']).toBe(200);
  });

  it('keeps bookings on the right day across the London clock change', () => {
    const r = report(
      [
        // 23:30 GMT on 28 March
        row({ starts_at: '2026-03-28T23:30:00Z', price_cents: 100 }),
        // 00:30 BST on 30 March (the clocks went forward on the 29th)
        row({ starts_at: '2026-03-29T23:30:00Z', price_cents: 200 }),
      ],
      { today: '2026-03-30', timezone: 'Europe/London' },
    );
    const byKey = Object.fromEntries(r.bars.map((b) => [b.key, b.cents]));
    expect(byKey['2026-03-28']).toBe(100);
    expect(byKey['2026-03-29']).toBe(0);
    expect(byKey['2026-03-30']).toBe(200);
  });

  it('groups a year by month', () => {
    const r = report(
      [
        row({ starts_at: '2026-01-31T10:00:00Z', price_cents: 100 }),
        row({ starts_at: '2026-10-02T10:00:00Z', price_cents: 300 }),
        row({ starts_at: '2026-10-14T10:00:00Z', price_cents: 400 }),
      ],
      { range: 'year' },
    );
    expect(r.bars).toHaveLength(10);
    expect(r.bars[0]).toEqual({ key: '2026-01-01', cents: 100 });
    expect(r.bars[9]).toEqual({ key: '2026-10-01', cents: 700 });
  });

  it('draws every day of the current week, with future days at zero', () => {
    const r = report([row()], { range: 'week' });
    expect(r.bars.map((b) => b.key)).toHaveLength(7);
    expect(r.bars[2]).toEqual({ key: '2026-10-14', cents: 10_000 });
    expect(r.bars[6].cents).toBe(0);
  });
});

describe('attendance and clients', () => {
  it.each([
    ['one in four', ['completed', 'completed', 'completed', 'no_show'], 25],
    ['none resolved yet', ['confirmed', 'confirmed'], null],
    ['all came', ['completed'], 0],
    ['cancelled does not count', ['cancelled', 'no_show', 'completed'], 50],
  ] as const)('no-show rate: %s', (_name, statuses, expected) => {
    const r = report(statuses.map((status) => row({ status })));
    expect(r.noShowPercent).toBe(expected);
  });

  it('counts a client once and splits new from returning', () => {
    const r = report(
      [
        row({ client_id: 'new1' }),
        row({ client_id: 'new1' }),
        row({ client_id: 'old1' }),
        row({ client_id: 'old2' }),
        row({ client_id: 'old3', status: 'cancelled' }),
      ],
      { newClients: ['new1', 'ghost'] },
    );
    expect(r.returningPercent).toBe(67);
  });
});

describe('staff, sources and busiest times', () => {
  it('ranks staff by revenue then bookings', () => {
    const r = report([
      row({ staff_id: 'a', staff_name: 'Ayanda', price_cents: 100 }),
      row({ staff_id: 'b', staff_name: 'Bongi', price_cents: 500 }),
      row({ staff_id: 'a', staff_name: 'Ayanda', status: 'confirmed' }),
      row({ staff_id: 'a', staff_name: 'Ayanda', status: 'cancelled' }),
    ]);
    expect(r.staff.map((s) => [s.name, s.revenueCents, s.bookings])).toEqual([
      ['Bongi', 500, 1],
      ['Ayanda', 100, 2],
    ]);
  });

  it('merges app and legacy bookings into Clovie', () => {
    const r = report([
      row({ source: 'whatsapp' }),
      row({ source: 'app' }),
      row({ source: 'legacy' }),
      row({ source: 'web' }),
      row({ source: 'whatsapp', status: 'cancelled' }),
    ]);
    expect(r.sources.map((s) => [s.key, s.count, s.percent])).toEqual([
      ['clovie', 3, 75],
      ['whatsapp', 1, 25],
    ]);
  });

  it('builds a Monday-first heatmap with the peak cell at full strength', () => {
    const r = report([
      // Wed 14 Oct at 10:00 and 10:30, Tue 13 Oct at 14:00 (Johannesburg)
      row({ starts_at: '2026-10-14T08:00:00Z' }),
      row({ starts_at: '2026-10-14T08:30:00Z' }),
      row({ starts_at: '2026-10-13T12:00:00Z' }),
    ]);
    const heat = r.heat!;
    expect(heat.weekdays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(heat.hours[0]).toBe(8);
    expect(heat.hours.at(-1)).toBe(17);
    const cell = (weekday: number, hour: number) =>
      heat.levels[heat.weekdays.indexOf(weekday)][heat.hours.indexOf(hour)];
    expect(cell(3, 10)).toBe(5);
    expect(cell(2, 14)).toBe(3);
    expect(cell(1, 9)).toBe(0);
    expect(heat.peak).toEqual({ weekday: 3, hour: 10 });
  });

  it('adds Sunday and stretches the hours only when bookings need them', () => {
    // Sun 11 Oct 04:00 UTC = 06:00 local; Sat 10 Oct 17:00 UTC = 19:00 local.
    const r = report([
      row({ starts_at: '2026-10-11T04:00:00Z' }),
      row({ starts_at: '2026-10-10T17:00:00Z' }),
    ]);
    expect(r.heat!.weekdays).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(r.heat!.hours.at(-1)).toBe(19);
  });
});
