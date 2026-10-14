import {
  appointmentSpan,
  blockTone,
  buildDayColumns,
  businessWindows,
  columnStaff,
  columnWidth,
  complementSpans,
  filterByStaff,
  intersectSpans,
  mergeSpans,
  nowMinute,
  shiftAnchor,
  staffWindows,
  timelineWindow,
  weekDates,
  weekStrip,
  weekSummary,
  type HoursRow,
  type OverrideRow,
  type RuleRow,
} from '../logic';

const TZ = 'Africa/Johannesburg';

// 2026-10-12 is a Monday, 2026-10-18 a Sunday.
const HOURS: HoursRow[] = [
  { weekday: 1, opens_at: '09:00:00', closes_at: '13:00:00' },
  { weekday: 1, opens_at: '14:00:00', closes_at: '18:00:00' },
  { weekday: 2, opens_at: '09:00:00', closes_at: '17:00:00' },
];

const override = (o: Partial<OverrideRow>): OverrideRow => ({
  staff_id: null,
  date: '2026-10-12',
  is_closed: false,
  start_time: null,
  end_time: null,
  ...o,
});

describe('shiftAnchor', () => {
  it.each([
    ['day', '2026-10-31', 1, '2026-11-01'],
    ['day', '2026-03-01', -1, '2026-02-28'],
    ['week', '2026-10-12', -1, '2026-10-05'],
    ['week', '2026-12-28', 1, '2027-01-04'],
  ] as const)(
    'moves a %s view from %s by %i',
    (view, anchor, dir, expected) => {
      expect(shiftAnchor(view, anchor, dir)).toBe(expected);
    },
  );
});

describe('weekDates / weekStrip', () => {
  it('starts the week on Monday, even when the anchor is a Sunday', () => {
    expect(weekDates('2026-10-18')[0]).toBe('2026-10-12');
    expect(weekDates('2026-10-18')[6]).toBe('2026-10-18');
  });

  it('marks today and the selected day', () => {
    const strip = weekStrip('2026-10-14', '2026-10-13');
    expect(strip.map((d) => d.num)).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(strip.find((d) => d.isToday)?.date).toBe('2026-10-13');
    expect(strip.find((d) => d.isSelected)?.date).toBe('2026-10-14');
  });
});

describe('span helpers', () => {
  it('merges overlapping and touching spans and drops empty ones', () => {
    expect(
      mergeSpans([
        { startMin: 600, endMin: 660 },
        { startMin: 540, endMin: 600 },
        { startMin: 700, endMin: 700 },
        { startMin: 800, endMin: 900 },
      ]),
    ).toEqual([
      { startMin: 540, endMin: 660 },
      { startMin: 800, endMin: 900 },
    ]);
  });

  it('intersects two lists of spans', () => {
    expect(
      intersectSpans(
        [{ startMin: 480, endMin: 720 }],
        [
          { startMin: 540, endMin: 600 },
          { startMin: 660, endMin: 900 },
        ],
      ),
    ).toEqual([
      { startMin: 540, endMin: 600 },
      { startMin: 660, endMin: 720 },
    ]);
  });

  it.each([
    ['no working spans: all hatched', [], [{ startMin: 480, endMin: 1080 }]],
    [
      'a lunch break between shifts',
      [
        { startMin: 540, endMin: 780 },
        { startMin: 840, endMin: 1020 },
      ],
      [
        { startMin: 480, endMin: 540 },
        { startMin: 780, endMin: 840 },
        { startMin: 1020, endMin: 1080 },
      ],
    ],
    ['working all day: nothing hatched', [{ startMin: 400, endMin: 1200 }], []],
    [
      'a span outside the window is ignored',
      [{ startMin: 1200, endMin: 1300 }],
      [{ startMin: 480, endMin: 1080 }],
    ],
  ])('complements %s', (_label, spans, expected) => {
    expect(complementSpans(spans, { startMin: 480, endMin: 1080 })).toEqual(
      expected,
    );
  });
});

describe('businessWindows', () => {
  it('uses the weekly hours, merged and sorted', () => {
    expect(businessWindows('2026-10-12', HOURS, [])).toEqual([
      { startMin: 540, endMin: 780 },
      { startMin: 840, endMin: 1080 },
    ]);
  });

  it('treats a weekday without rows as closed', () => {
    expect(businessWindows('2026-10-18', HOURS, [])).toEqual([]);
  });

  it('lets a business-wide closed override win', () => {
    expect(
      businessWindows('2026-10-12', HOURS, [override({ is_closed: true })]),
    ).toEqual([]);
  });

  it('replaces the hours with a business-wide window and ignores other dates and staff', () => {
    const overrides = [
      override({ start_time: '10:00:00', end_time: '12:00:00' }),
      override({ date: '2026-10-13', is_closed: true }),
      override({ staff_id: 's1', is_closed: true }),
    ];
    expect(businessWindows('2026-10-12', HOURS, overrides)).toEqual([
      { startMin: 600, endMin: 720 },
    ]);
  });
});

describe('staffWindows', () => {
  const rules: RuleRow[] = [
    {
      staff_id: 's1',
      weekday: 1,
      start_time: '08:00:00',
      end_time: '12:00:00',
    },
    {
      staff_id: 's1',
      weekday: 2,
      start_time: '10:00:00',
      end_time: '20:00:00',
    },
  ];
  const base = { date: '2026-10-12', staffId: 's1', hours: HOURS };

  it('clips the staff rules to business hours', () => {
    expect(staffWindows({ ...base, rules, overrides: [] })).toEqual([
      { startMin: 540, endMin: 720 },
    ]);
    expect(
      staffWindows({ ...base, date: '2026-10-13', rules, overrides: [] }),
    ).toEqual([{ startMin: 600, endMin: 1020 }]);
  });

  it('inherits the business windows when the staff member has no rules at all', () => {
    expect(
      staffWindows({ ...base, staffId: 's2', rules, overrides: [] }),
    ).toEqual(businessWindows('2026-10-12', HOURS, []));
  });

  it('is off on a weekday where they have rules for other days only', () => {
    expect(
      staffWindows({ ...base, date: '2026-10-14', rules, overrides: [] }),
    ).toEqual([]);
  });

  it('lets a staff override decide, never extending past business hours', () => {
    expect(
      staffWindows({
        ...base,
        rules,
        overrides: [
          override({
            staff_id: 's1',
            start_time: '12:00:00',
            end_time: '16:00:00',
          }),
        ],
      }),
    ).toEqual([
      { startMin: 720, endMin: 780 },
      { startMin: 840, endMin: 960 },
    ]);
    expect(
      staffWindows({
        ...base,
        rules,
        overrides: [override({ staff_id: 's1', is_closed: true })],
      }),
    ).toEqual([]);
  });
});

describe('timelineWindow', () => {
  it.each([
    ['no spans (fallback 09:00 to 18:00)', [], { startMin: 540, endMin: 1080 }],
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
    ).toEqual({ startMin: 570, endMin: 615 });
    expect(
      appointmentSpan(
        { starts_at: '2026-10-12T21:30:00.000Z', duration_minutes: 90 },
        TZ,
      ),
    ).toEqual({ startMin: 1410, endMin: 1440 });
  });
});

describe('nowMinute', () => {
  const window = { startMin: 540, endMin: 1080 };
  it.each([
    ['today, inside the window', '2026-10-14T08:40:00.000Z', '2026-10-14', 640],
    ['another day', '2026-10-14T08:40:00.000Z', '2026-10-15', null],
    ['before the window opens', '2026-10-14T04:00:00.000Z', '2026-10-14', null],
    ['after the window closes', '2026-10-14T18:00:00.000Z', '2026-10-14', null],
    // 22:30 UTC is already 00:30 the next day in Johannesburg.
    [
      'the business date, not the UTC date',
      '2026-10-13T22:30:00.000Z',
      '2026-10-14',
      null,
    ],
  ])('%s', (_label, now, date, expected) => {
    expect(nowMinute(new Date(now), TZ, date, window)).toBe(expected);
  });
});

describe('columnWidth', () => {
  it.each([
    [400, 1, 400],
    [400, 2, 200],
    [400, 5, 200],
    [300, 4, 150],
    [400, 0, 150],
  ])(
    'fills %i px with %i columns at %i px each',
    (available, cols, expected) => {
      expect(columnWidth(available, cols)).toBe(expected);
    },
  );
});

describe('buildDayColumns', () => {
  const staff = [
    { id: 's1', is_active: true },
    { id: 's2', is_active: true },
    { id: 's3', is_active: false },
  ];
  const appt = (id: string, staffId: string, startsAt: string) => ({
    id,
    starts_at: startsAt,
    duration_minutes: 60,
    staff: { id: staffId },
  });

  it('keeps inactive staff only when they have a booking', () => {
    expect(columnStaff(staff, []).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(
      columnStaff(staff, [{ staff: { id: 's3' } }]).map((s) => s.id),
    ).toEqual(['s1', 's2', 's3']);
  });

  it('groups bookings per column and widens the window to fit a late booking', () => {
    const { columns, window } = buildDayColumns({
      date: '2026-10-12',
      timezone: TZ,
      staff,
      appointments: [
        appt('a', 's1', '2026-10-12T07:00:00.000Z'), // 09:00
        appt('b', 's2', '2026-10-12T18:00:00.000Z'), // 20:00, after closing
      ],
      hours: HOURS,
      rules: [],
      overrides: [],
    });
    expect(columns.map((c) => c.appointments.map((a) => a.id))).toEqual([
      ['a'],
      ['b'],
    ]);
    expect(window).toEqual({ startMin: 540, endMin: 1260 });
  });
});

describe('weekSummary', () => {
  const at = (iso: string) => ({ starts_at: iso, staff: { id: 's1' } });

  it('counts bookings per business day, flags closed days and scales the bars', () => {
    const summary = weekSummary({
      anchor: '2026-10-14',
      today: '2026-10-14',
      timezone: TZ,
      appointments: [
        at('2026-10-12T07:00:00.000Z'),
        at('2026-10-12T09:00:00.000Z'),
        at('2026-10-13T07:00:00.000Z'),
      ],
      hours: HOURS,
      overrides: [],
    });
    expect(summary.total).toBe(3);
    expect(summary.days.map((d) => d.count)).toEqual([2, 1, 0, 0, 0, 0, 0]);
    expect(summary.days.map((d) => d.isClosed)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(summary.days[0].fullness).toBe(1);
    expect(summary.days[1].fullness).toBe(0.5);
    expect(summary.days[2].isToday).toBe(true);
  });

  it('shows a day with bookings as open even when the hours say closed, and honours closed overrides', () => {
    const summary = weekSummary({
      anchor: '2026-10-12',
      today: '2026-10-14',
      timezone: TZ,
      appointments: [at('2026-10-18T07:00:00.000Z')],
      hours: HOURS,
      overrides: [override({ date: '2026-10-13', is_closed: true })],
    });
    expect(summary.days[6].isClosed).toBe(false);
    expect(summary.days[1].isClosed).toBe(true);
    expect(summary.days[0].isClosed).toBe(false);
  });

  it('never divides by zero on an empty week', () => {
    const summary = weekSummary({
      anchor: '2026-10-12',
      today: '2026-10-14',
      timezone: TZ,
      appointments: [],
      hours: HOURS,
      overrides: [],
    });
    expect(summary.days.every((d) => d.fullness === 0)).toBe(true);
  });
});

describe('filterByStaff', () => {
  const list = [{ staff: { id: 'a' } }, { staff: { id: 'b' } }];
  it('returns everything for null and one person otherwise', () => {
    expect(filterByStaff(list, null)).toHaveLength(2);
    expect(filterByStaff(list, 'b')).toEqual([{ staff: { id: 'b' } }]);
  });
});

describe('blockTone', () => {
  it.each([
    ['confirmed', null, 'upcoming'],
    ['confirmed', '2026-10-14T08:00:00Z', 'arrived'],
    ['completed', '2026-10-14T08:00:00Z', 'done'],
    ['no_show', null, 'noShow'],
  ] as const)('%s with check-in %s is %s', (status, checkedIn, expected) => {
    expect(blockTone({ status, checked_in_at: checkedIn })).toBe(expected);
  });
});
