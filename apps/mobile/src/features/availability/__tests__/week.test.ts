import {
  businessFit,
  toHoursRows,
  toRuleRows,
  toStaffWeek,
  toWeekSchedule,
  validateStaffWeek,
  validateWeek,
  type DayHours,
} from '../week';

const day = (o: Partial<DayHours> = {}): DayHours => ({
  weekday: 3,
  isOpen: true,
  opens: '09:00',
  closes: '17:00',
  ...o,
});

describe('toWeekSchedule', () => {
  it('orders the week Monday first with one range per day', () => {
    const week = toWeekSchedule([
      { weekday: 1, opens_at: '09:00:00', closes_at: '13:00:00' },
    ]);
    expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(week[0]).toEqual({
      weekday: 1,
      isOpen: true,
      opens: '09:00',
      closes: '13:00',
    });
  });

  it('keeps only the earliest range if a legacy day still has two', () => {
    const week = toWeekSchedule([
      { weekday: 1, opens_at: '14:00:00', closes_at: '18:00:00' },
      { weekday: 1, opens_at: '09:00:00', closes_at: '13:00:00' },
    ]);
    expect(week[0]).toMatchObject({ opens: '09:00', closes: '13:00' });
  });

  it('marks days without a row closed but keeps a range to reopen with', () => {
    expect(toWeekSchedule([])[6]).toEqual({
      weekday: 0,
      isOpen: false,
      opens: '09:00',
      closes: '17:00',
    });
  });
});

describe('toStaffWeek', () => {
  const business = [
    { weekday: 6, opens_at: '08:00:00', closes_at: '15:00:00' },
  ];

  it('uses the own rules and offers the business range on days off', () => {
    const week = toStaffWeek(
      [{ weekday: 1, start_time: '10:00:00', end_time: '16:00:00' }],
      business,
    );
    expect(week[0]).toMatchObject({ isOpen: true, opens: '10:00' });
    expect(week[5]).toEqual({
      weekday: 6,
      isOpen: false,
      opens: '08:00',
      closes: '15:00',
    });
  });
});

describe('request rows', () => {
  const days = [day({ weekday: 1 }), day({ weekday: 0, isOpen: false })];

  it('emits one row per open day for the business hours', () => {
    expect(toHoursRows(days)).toEqual([
      { weekday: 1, opens_at: '09:00', closes_at: '17:00' },
    ]);
  });

  it('emits one rule per open day for a person, and none to inherit', () => {
    expect(toRuleRows(days)).toEqual([
      { weekday: 1, start_time: '09:00', end_time: '17:00' },
    ]);
    expect(toRuleRows([day({ isOpen: false })])).toEqual([]);
  });
});

describe('validateWeek', () => {
  it.each([
    ['a normal day', day(), null],
    [
      'a closing time before opening',
      day({ opens: '18:00', closes: '09:00' }),
      'order',
    ],
    ['a zero-length day', day({ closes: '09:00' }), 'order'],
    [
      'bad times on a closed day',
      day({ isOpen: false, opens: '18:00', closes: '09:00' }),
      null,
    ],
  ])('reports %s', (_label, input, reason) => {
    expect(validateWeek([input])?.reason ?? null).toBe(reason);
  });
});

describe('businessFit and validateStaffWeek', () => {
  const business = day({ opens: '08:00', closes: '18:00' });

  it.each([
    ['inside', day({ opens: '09:00', closes: '17:00' }), business, null],
    [
      'the same hours',
      day({ opens: '08:00', closes: '18:00' }),
      business,
      null,
    ],
    [
      'starting early',
      day({ opens: '07:00', closes: '17:00' }),
      business,
      'outside',
    ],
    [
      'ending late',
      day({ opens: '09:00', closes: '19:00' }),
      business,
      'outside',
    ],
    ['a closed business day', day(), day({ isOpen: false }), 'closed'],
    ['a day off', day({ isOpen: false }), day({ isOpen: false }), null],
    ['no business row', day(), undefined, 'closed'],
  ])('fits %s', (_label, mine, biz, expected) => {
    expect(businessFit(mine, biz)).toBe(expected);
  });

  it('names the first day that does not fit, after the order check', () => {
    const mine = [day({ weekday: 1 }), day({ weekday: 3, closes: '20:00' })];
    const biz = [
      day({ weekday: 1, opens: '08:00', closes: '18:00' }),
      day({ weekday: 3, opens: '08:00', closes: '18:00' }),
    ];
    expect(validateStaffWeek(mine, biz)).toEqual({
      weekday: 3,
      reason: 'outside',
    });
    expect(validateStaffWeek([day({ closes: '08:00' })], biz)).toEqual({
      weekday: 3,
      reason: 'order',
    });
    expect(validateStaffWeek([mine[0]], biz)).toBeNull();
  });
});
