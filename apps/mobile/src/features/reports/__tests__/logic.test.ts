import {
  recentMonths,
  busiestParts,
  canGoNext,
  chartBars,
  currentWeekIndex,
  defaultSelection,
  monthLabel,
  monthOf,
  niceMax,
  shiftMonth,
  sourceRows,
} from '../logic';

describe('months', () => {
  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', -13, '2025-09'],
    ['2026-10', 0, '2026-10'],
  ])('shifts %s by %i to %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('reads the month of a date and labels it', () => {
    expect(monthOf('2026-10-14')).toBe('2026-10');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });

  it('stops the next arrow at the current month', () => {
    expect(canGoNext('2026-09', '2026-10')).toBe(true);
    expect(canGoNext('2026-10', '2026-10')).toBe(false);
  });
});

describe('niceMax', () => {
  it.each([
    [0, 4],
    [3, 4],
    [5, 5],
    [6, 10],
    [14, 20],
    [21, 50],
    [63, 100],
    [100, 100],
    [101, 200],
  ])('rounds %i up to %i', (max, expected) => {
    expect(niceMax(max)).toBe(expected);
  });
});

const WEEKLY = [
  { week_start: '2026-09-28', completed_jobs: 2 },
  { week_start: '2026-10-05', completed_jobs: 10 },
  { week_start: '2026-10-12', completed_jobs: 0 },
];

describe('chartBars', () => {
  it('scales bars, keeps an empty week as a stub and marks the current week', () => {
    const { bars, axisMax } = chartBars(WEEKLY, 100, '2026-10-14');
    expect(axisMax).toBe(10);
    expect(bars.map((b) => b.height)).toEqual([20, 100, 2]);
    expect(bars.map((b) => b.isCurrent)).toEqual([false, false, true]);
    expect(bars[1].label).toBe('5 Oct');
  });

  it('gives a one-job week a visible bar', () => {
    const { bars } = chartBars(
      [{ week_start: '2026-10-05', completed_jobs: 1 }],
      100,
      '2026-10-14',
    );
    expect(bars[0].height).toBeGreaterThanOrEqual(4);
  });

  it('handles a month with no weeks', () => {
    expect(chartBars([], 100, '2026-10-14').bars).toEqual([]);
  });
});

describe('week selection', () => {
  it('finds the current week, and null outside the month', () => {
    expect(currentWeekIndex(WEEKLY, '2026-10-14')).toBe(2);
    expect(currentWeekIndex(WEEKLY, '2026-11-02')).toBeNull();
  });
  it('starts on the current week, else the latest week with jobs', () => {
    expect(defaultSelection(WEEKLY, '2026-10-14')).toBe(2);
    expect(defaultSelection(WEEKLY, '2026-11-02')).toBe(1);
    expect(defaultSelection([], '2026-11-02')).toBe(0);
  });
});

describe('sourceRows', () => {
  it('orders by count and rounds percentages', () => {
    const rows = sourceRows({ whatsapp: 3, companion: 6, manual: 1, web: 0 });
    expect(rows.map((r) => [r.key, r.percent])).toEqual([
      ['companion', 60],
      ['whatsapp', 30],
      ['manual', 10],
      ['web', 0],
    ]);
  });
  it('is empty when nothing was booked', () => {
    expect(
      sourceRows({ whatsapp: 0, companion: 0, manual: 0, web: 0 }),
    ).toEqual([]);
  });
});

describe('busiestParts', () => {
  it('names the weekday and the hour', () => {
    expect(busiestParts({ weekday: 6, hour: 10 })).toEqual({
      day: 'Saturday',
      time: '10:00',
    });
    expect(busiestParts({ weekday: 0, hour: 8 })).toEqual({
      day: 'Sunday',
      time: '08:00',
    });
  });
});

describe('recentMonths', () => {
  it('lists the current month first, then the ones before it across a year end', () => {
    expect(recentMonths('2026-02', 4)).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });
});
