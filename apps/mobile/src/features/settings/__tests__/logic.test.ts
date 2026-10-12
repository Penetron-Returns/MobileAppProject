import {
  nextRange,
  toHoursRows,
  toWeekSchedule,
  validateWeek,
  type DayHours,
} from '../logic';
import {
  toCreateServiceRequest,
  toServiceFields,
  toStaffFields,
} from '../schemas';

describe('toWeekSchedule', () => {
  it('orders the week Monday first and groups split shifts per day', () => {
    const week = toWeekSchedule([
      { weekday: 1, opens_at: '14:00:00', closes_at: '18:00:00' },
      { weekday: 1, opens_at: '09:00:00', closes_at: '13:00:00' },
    ]);
    expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(week[0]).toEqual({
      weekday: 1,
      isOpen: true,
      ranges: [
        { opens: '09:00', closes: '13:00' },
        { opens: '14:00', closes: '18:00' },
      ],
    });
  });

  it('marks days without rows closed but keeps a default range to reopen with', () => {
    expect(toWeekSchedule([])[6]).toEqual({
      weekday: 0,
      isOpen: false,
      ranges: [{ opens: '09:00', closes: '17:00' }],
    });
  });
});

describe('toHoursRows', () => {
  it('emits rows only for open days', () => {
    const days: DayHours[] = [
      {
        weekday: 1,
        isOpen: true,
        ranges: [
          { opens: '09:00', closes: '13:00' },
          { opens: '14:00', closes: '18:00' },
        ],
      },
      {
        weekday: 0,
        isOpen: false,
        ranges: [{ opens: '09:00', closes: '17:00' }],
      },
    ];
    expect(toHoursRows(days)).toEqual([
      { weekday: 1, opens_at: '09:00', closes_at: '13:00' },
      { weekday: 1, opens_at: '14:00', closes_at: '18:00' },
    ]);
  });
});

describe('validateWeek', () => {
  const day = (ranges: [string, string][], isOpen = true): DayHours => ({
    weekday: 3,
    isOpen,
    ranges: ranges.map(([opens, closes]) => ({ opens, closes })),
  });

  it.each([
    [
      'valid split shifts',
      day([
        ['09:00', '13:00'],
        ['14:00', '18:00'],
      ]),
      null,
    ],
    [
      'back-to-back ranges',
      day([
        ['09:00', '13:00'],
        ['13:00', '18:00'],
      ]),
      null,
    ],
    [
      'a range that closes before it opens',
      day([['18:00', '09:00']]),
      { weekday: 3, reason: 'order' },
    ],
    [
      'a zero-length range',
      day([['09:00', '09:00']]),
      { weekday: 3, reason: 'order' },
    ],
    [
      'overlapping ranges',
      day([
        ['09:00', '13:00'],
        ['12:00', '18:00'],
      ]),
      { weekday: 3, reason: 'overlap' },
    ],
    ['bad ranges on a closed day', day([['18:00', '09:00']], false), null],
  ])('reports %s', (_label, input, expected) => {
    expect(validateWeek([input])).toEqual(expected);
  });
});

describe('nextRange', () => {
  it('starts an hour after the last range and stays inside the day', () => {
    expect(nextRange([{ opens: '09:00', closes: '13:00' }])).toEqual({
      opens: '14:00',
      closes: '16:00',
    });
    expect(nextRange([{ opens: '20:00', closes: '22:30' }])).toEqual({
      opens: '22:00',
      closes: '23:30',
    });
  });
});

describe('service and staff request builders', () => {
  const service = {
    name: 'Cut',
    category: '',
    duration_minutes: 45,
    price: 'R 250,50',
    is_active: true,
  };

  it('converts the typed price to cents and blank category to null', () => {
    expect(toServiceFields(service)).toEqual({
      name: 'Cut',
      category: null,
      duration_minutes: 45,
      price_cents: 25050,
      is_active: true,
    });
  });

  it('adds create-only defaults for a new service', () => {
    expect(toCreateServiceRequest(service)).toMatchObject({
      description: null,
      deposit_cents: 0,
      sort_order: 0,
    });
  });

  it('never sends login, photo or contact fields when editing staff', () => {
    const fields = toStaffFields({
      name: 'Emma',
      title: '',
      is_active: true,
      accepts_bookings: false,
      service_ids: ['s1'],
    });
    expect(Object.keys(fields).sort()).toEqual([
      'accepts_bookings',
      'is_active',
      'name',
      'service_ids',
      'title',
    ]);
    expect(fields.title).toBeNull();
  });
});
