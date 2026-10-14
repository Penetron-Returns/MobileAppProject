import {
  existingCategories,
  groupByCategory,
  joinMeta,
  staffStatus,
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
