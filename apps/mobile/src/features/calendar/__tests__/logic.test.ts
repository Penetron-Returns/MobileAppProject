import {
  appointmentSpan,
  breaksBetween,
  countByDate,
  layoutLanes,
  monthGrid,
  periodRange,
  shiftAnchor,
  shiftsForWeekday,
  timelineWindow,
} from '../logic';

const TZ = 'Africa/Johannesburg';

describe('periodRange', () => {
  it.each([
    ['day', '2026-10-12', { from: '2026-10-12', to: '2026-10-13' }],
    [
      'week (Monday start, anchor on a Sunday)',
      '2026-10-18',
      { from: '2026-10-12', to: '2026-10-19' },
    ],
    [
      'month (full Monday-first grid)',
      '2026-10-12',
      { from: '2026-09-28', to: '2026-11-02' },
    ],
  ] as const)('covers the %s view', (label, anchor, expected) => {
    const view = label.split(' ')[0] as 'day' | 'week' | 'month';
    expect(periodRange(view, anchor)).toEqual(expected);
  });
});

describe('shiftAnchor', () => {
  it.each([
    ['day', '2026-10-31', 1, '2026-11-01'],
    ['week', '2026-10-12', -1, '2026-10-05'],
    ['month', '2026-01-31', 1, '2026-02-01'],
    ['month', '2026-01-15', -1, '2025-12-01'],
  ] as const)(
    'moves a %s view from %s by %i',
    (view, anchor, dir, expected) => {
      expect(shiftAnchor(view, anchor, dir)).toBe(expected);
    },
  );
});

describe('monthGrid', () => {
  it('builds Monday-first weeks that include leading and trailing days', () => {
    const weeks = monthGrid('2026-02-10');
    expect(weeks[0][0]).toEqual({ date: '2026-01-26', isCurrentMonth: false });
    expect(weeks[0][6]).toEqual({ date: '2026-02-01', isCurrentMonth: true });
    expect(weeks.at(-1)?.[6]).toEqual({
      date: '2026-03-01',
      isCurrentMonth: false,
    });
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });
});

describe('business hours', () => {
  const hours = [
    { weekday: 1, opens_at: '14:00:00', closes_at: '18:00:00' },
    { weekday: 1, opens_at: '09:00:00', closes_at: '13:00:00' },
    { weekday: 2, opens_at: '09:00:00', closes_at: '17:00:00' },
  ];

  it('sorts a weekday’s shifts and finds the break between them', () => {
    const monday = shiftsForWeekday(hours, 1);
    expect(monday).toEqual([
      { startMin: 540, endMin: 780 },
      { startMin: 840, endMin: 1080 },
    ]);
    expect(breaksBetween(monday)).toEqual([{ startMin: 780, endMin: 840 }]);
  });

  it('treats a weekday without rows as closed', () => {
    expect(shiftsForWeekday(hours, 0)).toEqual([]);
  });
});

describe('timelineWindow', () => {
  it.each([
    ['no spans (fallback 09:00–18:00)', [], { startMin: 540, endMin: 1080 }],
    [
      'spans rounded out to whole hours',
      [{ startMin: 545, endMin: 1015 }],
      { startMin: 540, endMin: 1020 },
    ],
    [
      'an appointment outside opening hours',
      [
        { startMin: 540, endMin: 1080 },
        { startMin: 1170, endMin: 1230 },
      ],
      { startMin: 540, endMin: 1260 },
    ],
    [
      'a span ending at midnight',
      [{ startMin: 1380, endMin: 1440 }],
      { startMin: 1380, endMin: 1440 },
    ],
  ])('covers %s', (_label, spans, expected) => {
    expect(timelineWindow(spans)).toEqual(expected);
  });
});

describe('appointmentSpan', () => {
  it('measures minutes in the business timezone and caps at midnight', () => {
    expect(
      appointmentSpan(
        { starts_at: '2026-10-12T07:30:00.000Z', duration_minutes: 45 },
        TZ,
      ),
    ).toEqual({
      startMin: 570,
      endMin: 615,
    });
    expect(
      appointmentSpan(
        { starts_at: '2026-10-12T21:30:00.000Z', duration_minutes: 90 },
        TZ,
      ),
    ).toEqual({
      startMin: 1410,
      endMin: 1440,
    });
  });
});

describe('layoutLanes', () => {
  const block = (id: string, startMin: number, endMin: number) => ({
    item: id,
    span: { startMin, endMin },
  });

  it('gives non-overlapping blocks a full-width single lane', () => {
    const result = layoutLanes([block('a', 540, 600), block('b', 600, 660)]);
    expect(result.map((r) => [r.item, r.lane, r.lanes])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('splits a cluster of overlapping blocks into lanes and reuses freed lanes', () => {
    const result = layoutLanes([
      block('a', 540, 660),
      block('b', 570, 600),
      block('c', 600, 630),
      block('d', 700, 760),
    ]);
    expect(result.map((r) => [r.item, r.lane, r.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 1, 2],
      ['d', 0, 1],
    ]);
  });

  it('returns nothing for an empty day', () => {
    expect(layoutLanes([])).toEqual([]);
  });
});

describe('countByDate', () => {
  it('groups appointments by business date', () => {
    expect(
      countByDate(
        [
          { starts_at: '2026-10-12T08:00:00.000Z' },
          { starts_at: '2026-10-12T21:59:00.000Z' },
          { starts_at: '2026-10-12T22:00:00.000Z' },
        ],
        TZ,
      ),
    ).toEqual({ '2026-10-12': 2, '2026-10-13': 1 });
  });
});
