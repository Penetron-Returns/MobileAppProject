import {
  compactMoney,
  durationLabel,
  existingCategories,
  firstName,
  groupByCategory,
  joinMeta,
  staffStatus,
  stepValue,
} from '../lists';

describe('groupByCategory', () => {
  it('groups by trimmed category in first-seen order', () => {
    const items = [
      { id: 1, category: 'Hair' },
      { id: 2, category: ' Nails ' },
      { id: 3, category: 'Hair' },
    ];
    expect(groupByCategory(items, 'Other')).toEqual([
      ['Hair', [items[0], items[2]]],
      ['Nails', [items[1]]],
    ]);
  });

  it('puts blank and missing categories under the fallback label', () => {
    const items = [
      { id: 1, category: null },
      { id: 2, category: '  ' },
    ];
    expect(groupByCategory(items, 'Other')).toEqual([['Other', items]]);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByCategory([], 'Other')).toEqual([]);
  });
});

describe('existingCategories', () => {
  it('lists each category once and skips blanks', () => {
    expect(
      existingCategories([
        { category: 'Hair' },
        { category: 'Hair ' },
        { category: null },
        { category: '' },
        { category: 'Nails' },
      ]),
    ).toEqual(['Hair', 'Nails']);
  });
});

describe('joinMeta', () => {
  it('joins present parts with a middle dot', () => {
    expect(joinMeta('45 min', 'R350')).toBe('45 min · R350');
  });

  it('skips empty parts', () => {
    expect(joinMeta('Stylist', null, false, '')).toBe('Stylist');
    expect(joinMeta(null, undefined)).toBe('');
  });
});

describe('staffStatus', () => {
  it.each([
    [{ is_active: true, accepts_bookings: true }, 'active'],
    [{ is_active: true, accepts_bookings: false }, 'paused'],
    [{ is_active: false, accepts_bookings: true }, 'inactive'],
    [{ is_active: false, accepts_bookings: false }, 'inactive'],
  ] as const)('maps %j to %s', (member, expected) => {
    expect(staffStatus(member)).toBe(expected);
  });
});

describe('compactMoney', () => {
  it.each([
    [35000, 'ZAR', 'R350'],
    [128000, 'ZAR', 'R1,280'],
    [35050, 'ZAR', 'R350.50'],
    [0, 'ZAR', 'R0'],
    [9000, 'USD', '$90'],
  ])('writes %i %s as %s', (cents, currency, expected) => {
    expect(compactMoney(cents, currency)).toBe(expected);
  });
});

describe('durationLabel', () => {
  const t = (key: string, v?: Record<string, unknown>) =>
    `${key}:${JSON.stringify(v)}`;
  it.each([
    [45, 'services.minutes:{"value":45}'],
    [60, 'services.hoursOnly:{"hours":1}'],
    [75, 'services.hoursAndMinutes:{"hours":1,"minutes":15}'],
    [240, 'services.hoursOnly:{"hours":4}'],
  ])('labels %i minutes', (minutes, expected) => {
    expect(durationLabel(minutes, t)).toBe(expected);
  });
});

describe('firstName', () => {
  it.each([
    ['Thandi Mokoena', 'Thandi'],
    ['  Ruan  van Wyk', 'Ruan'],
    ['Aisha', 'Aisha'],
  ])('takes the first name of %s', (name, expected) => {
    expect(firstName(name)).toBe(expected);
  });
});

describe('stepValue', () => {
  it.each([
    [60, 1, 15, 15, 480, 75],
    [60, -1, 15, 15, 480, 45],
    [15, -1, 15, 15, 480, 15],
    [480, 1, 15, 15, 480, 480],
    [10, 1, 5, 0, 60, 15],
    [0, -1, 5, 0, 60, 0],
  ] as const)(
    'steps %i by %i (step %i) within %i..%i to %i',
    (value, dir, step, min, max, expected) => {
      expect(stepValue(value, dir, step, min, max)).toBe(expected);
    },
  );
});
