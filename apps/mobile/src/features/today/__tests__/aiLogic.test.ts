import {
  bookableMinutes,
  bookedMinutes,
  bookedPercent,
  buildDigest,
  clovieBookedCount,
  hasAfternoonStarted,
  digestCounts,
  nowRow,
  revenueSoFarCents,
  type AiAppointment,
  type AiEvent,
} from '../aiLogic';

const TZ = 'Africa/Johannesburg'; // UTC+2, no DST
const DATE = '2026-10-14'; // a Wednesday (weekday 3)

/** Business-local HH:mm on DATE as a UTC ISO instant. */
const at = (hhmm: string, date = DATE) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h - 2, m)).toISOString();
};

function appt(
  id: string,
  from: string,
  to: string,
  overrides: Partial<AiAppointment> = {},
): AiAppointment {
  const minutes =
    (new Date(at(to)).getTime() - new Date(at(from)).getTime()) / 60_000;
  return {
    id,
    starts_at: at(from),
    ends_at: at(to),
    duration_minutes: minutes,
    status: 'confirmed',
    checked_in_at: null,
    price_cents: 50_000,
    source: 'app',
    client: { name: `Client ${id}`, phone_e164: '+27825550100' },
    service: { name: 'Cut' },
    staff: { name: 'Thandi' },
    ...overrides,
  };
}

describe('bookedMinutes', () => {
  it.each([
    ['no bookings', [], 0],
    [
      'sums durations',
      [appt('a', '09:00', '10:00'), appt('b', '10:00', '10:30')],
      90,
    ],
    [
      'a cancelled booking frees its time',
      [
        appt('a', '09:00', '10:00'),
        appt('b', '10:00', '11:00', { status: 'cancelled' }),
      ],
      60,
    ],
    [
      'completed and no-show time still counted',
      [
        appt('a', '09:00', '10:00', { status: 'completed' }),
        appt('b', '10:00', '11:00', { status: 'no_show' }),
      ],
      120,
    ],
  ])('%s', (_name, list, expected) => {
    expect(bookedMinutes(list as AiAppointment[])).toBe(expected);
  });
});

describe('bookableMinutes', () => {
  const hours = [
    { weekday: 3, opens_at: '08:00:00', closes_at: '17:00:00' },
    { weekday: 6, opens_at: '09:00:00', closes_at: '13:00:00' },
  ];

  it.each([
    ['one person on business hours', ['s1'], [], 540],
    ['two people, both follow business hours', ['s1', 's2'], [], 1080],
    [
      'own rules replace the business hours for that person',
      ['s1', 's2'],
      [
        {
          staff_id: 's2',
          weekday: 3,
          start_time: '10:00:00',
          end_time: '14:00:00',
        },
      ],
      540 + 240,
    ],
    [
      'a person with rules but none today is off',
      ['s1', 's2'],
      [
        {
          staff_id: 's2',
          weekday: 1,
          start_time: '10:00:00',
          end_time: '14:00:00',
        },
      ],
      540,
    ],
    ['no bookable staff', [], [], 0],
    [
      'split shifts add up',
      ['s1'],
      [
        {
          staff_id: 's1',
          weekday: 3,
          start_time: '08:00:00',
          end_time: '12:00:00',
        },
        {
          staff_id: 's1',
          weekday: 3,
          start_time: '13:00:00',
          end_time: '16:00:00',
        },
      ],
      420,
    ],
  ])('%s', (_name, staffIds, rules, expected) => {
    expect(bookableMinutes({ date: DATE, hours, staffIds, rules })).toBe(
      expected,
    );
  });

  it('is zero on a closed day (no hours for that weekday)', () => {
    expect(
      bookableMinutes({
        date: '2026-10-18',
        hours,
        staffIds: ['s1'],
        rules: [],
      }),
    ).toBe(0);
  });

  it('is zero with no hours at all', () => {
    expect(
      bookableMinutes({ date: DATE, hours: [], staffIds: ['s1'], rules: [] }),
    ).toBe(0);
  });
});

describe('bookedPercent', () => {
  it.each([
    [0, 540, 0],
    [360, 540, 67],
    [540, 540, 100],
    [900, 540, 100],
    [60, 0, null],
    [0, 0, null],
  ])('%i booked of %i bookable is %s', (booked, bookable, expected) => {
    expect(bookedPercent(booked, bookable)).toBe(expected);
  });
});

describe('revenueSoFarCents', () => {
  const now = new Date(at('12:00'));
  it.each([
    ['nothing booked', [], 0],
    [
      'only work that has ended',
      [appt('a', '09:00', '10:00'), appt('b', '13:00', '14:00')],
      50_000,
    ],
    [
      'a booking in progress is not earned yet',
      [appt('a', '11:30', '12:30')],
      0,
    ],
    ['ends exactly now counts', [appt('a', '11:00', '12:00')], 50_000],
    [
      'cancelled and no-show are excluded',
      [
        appt('a', '09:00', '10:00', { status: 'cancelled' }),
        appt('b', '10:00', '11:00', { status: 'no_show' }),
        appt('c', '08:00', '09:00', {
          status: 'completed',
          price_cents: 12_000,
        }),
      ],
      12_000,
    ],
  ])('%s', (_name, list, expected) => {
    expect(revenueSoFarCents(list as AiAppointment[], now)).toBe(expected);
  });

  it('counts a day that has not started as zero (midnight)', () => {
    expect(
      revenueSoFarCents([appt('a', '09:00', '10:00')], new Date(at('00:00'))),
    ).toBe(0);
  });
});

describe('clovieBookedCount', () => {
  it('counts live bookings made by the companion only', () => {
    expect(
      clovieBookedCount([
        appt('a', '09:00', '10:00', { source: 'nerova' }),
        appt('b', '10:00', '11:00', { source: 'nerova', status: 'cancelled' }),
        appt('c', '11:00', '12:00', { source: 'whatsapp' }),
        appt('d', '12:00', '13:00', { source: 'nerova' }),
      ]),
    ).toBe(2);
  });

  it('is zero with no bookings', () => {
    expect(clovieBookedCount([])).toBe(0);
  });
});

describe('nowRow', () => {
  const base = { timezone: TZ, isBusy: false };
  const day = [
    appt('a', '09:00', '10:00'),
    appt('b', '11:00', '12:00', {
      client: { name: 'Thandi', phone_e164: '+1' },
    }),
    appt('c', '14:00', '15:00', {
      client: { name: 'Megan', phone_e164: '+1' },
    }),
  ];

  it('says "with" the client until the end time while a booking is under way', () => {
    const row = nowRow({
      ...base,
      appointments: day,
      now: new Date(at('11:20')),
    });
    expect(row.primary).toEqual({
      kind: 'with',
      name: 'Thandi',
      time: '12:00',
    });
    expect(row.secondary).toEqual({
      kind: 'next',
      name: 'Megan',
      time: '14:00',
    });
  });

  it('is calm with the next booking underneath between bookings', () => {
    const row = nowRow({
      ...base,
      appointments: day,
      now: new Date(at('10:30')),
    });
    expect(row.primary).toEqual({ kind: 'calm' });
    expect(row.secondary).toEqual({
      kind: 'next',
      name: 'Thandi',
      time: '11:00',
    });
  });

  it('has nothing after the last booking under way', () => {
    const row = nowRow({
      ...base,
      appointments: day,
      now: new Date(at('14:30')),
    });
    expect(row.primary).toMatchObject({ kind: 'with', name: 'Megan' });
    expect(row.secondary).toBeNull();
  });

  it('is quiet once everything has finished', () => {
    const row = nowRow({
      ...base,
      appointments: day,
      now: new Date(at('18:00')),
    });
    expect(row).toEqual({ primary: { kind: 'quiet' }, secondary: null });
  });

  it('is quiet with no bookings at all', () => {
    expect(
      nowRow({ ...base, appointments: [], now: new Date(at('09:00')) }),
    ).toEqual({ primary: { kind: 'quiet' }, secondary: null });
  });

  it('ignores cancelled bookings', () => {
    const row = nowRow({
      ...base,
      appointments: [appt('a', '11:00', '12:00', { status: 'cancelled' })],
      now: new Date(at('10:00')),
    });
    expect(row.primary).toEqual({ kind: 'quiet' });
  });

  it('leads with "working" while the companion is busy and keeps the facts below', () => {
    const row = nowRow({
      ...base,
      isBusy: true,
      appointments: day,
      now: new Date(at('11:20')),
    });
    expect(row.primary).toEqual({ kind: 'working' });
    expect(row.secondary).toMatchObject({ kind: 'with', name: 'Thandi' });
  });
});

function event(
  id: string,
  type: string,
  occurred: string,
  overrides: Partial<AiEvent> = {},
): AiEvent {
  return {
    id,
    type,
    occurred_at: at(occurred),
    actor: 'staff',
    appointment: { starts_at: at('15:00'), client: { name: 'Megan' } },
    ...overrides,
  };
}

describe('buildDigest', () => {
  it('splits morning from afternoon at 12:00 business time', () => {
    const d = buildDigest(
      [
        event('1', 'created', '11:59'),
        event('2', 'created', '12:00'),
        event('3', 'rescheduled', '07:00'),
      ],
      DATE,
      TZ,
    );
    expect(d.morning.counts).toEqual({ booked: 1, moved: 1, cancelled: 0 });
    expect(d.afternoon.counts).toEqual({ booked: 1, moved: 0, cancelled: 0 });
  });

  it('is empty without events', () => {
    const d = buildDigest([], DATE, TZ);
    expect(d.morning.entries).toEqual([]);
    expect(digestCounts(d.afternoon)).toEqual([]);
  });

  it('orders entries oldest first and reports Clovie as the actor', () => {
    const d = buildDigest(
      [
        event('late', 'cancelled', '10:00'),
        event('early', 'created', '08:15', { actor: 'nerova' }),
      ],
      DATE,
      TZ,
    );
    expect(d.morning.entries.map((e) => e.id)).toEqual(['early', 'late']);
    expect(d.morning.entries[0]).toMatchObject({
      time: '08:15',
      kind: 'booked',
      name: 'Megan',
      when: '15:00',
      byClovie: true,
    });
    expect(d.morning.entries[1].byClovie).toBe(false);
  });

  it('skips other kinds and other business days', () => {
    const d = buildDigest(
      [
        event('r', 'reminder_sent', '09:00'),
        event('c', 'checked_in', '09:05'),
        // 23:30 UTC the day before is 01:30 business time today: counts.
        { ...event('mid', 'created', '01:30') },
        // 22:30 UTC today is 00:30 business time tomorrow: excluded.
        {
          ...event('next', 'created', '09:00'),
          occurred_at: '2026-10-14T22:30:00.000Z',
        },
      ],
      DATE,
      TZ,
    );
    expect(d.morning.entries.map((e) => e.id)).toEqual(['mid']);
    expect(d.afternoon.entries).toEqual([]);
  });

  it('puts the date on a booking that is not today', () => {
    const d = buildDigest(
      [
        event('x', 'created', '09:00', {
          appointment: { starts_at: at('10:00', '2026-10-16'), client: null },
        }),
      ],
      DATE,
      TZ,
    );
    expect(d.morning.entries[0]).toMatchObject({
      when: '16 Oct 10:00',
      name: null,
    });
  });

  it('lists non-zero counts in reading order', () => {
    const d = buildDigest(
      [
        event('1', 'cancelled', '08:00'),
        event('2', 'created', '08:30'),
        event('3', 'created', '09:00'),
      ],
      DATE,
      TZ,
    );
    expect(digestCounts(d.morning)).toEqual([
      { kind: 'booked', count: 2 },
      { kind: 'cancelled', count: 1 },
    ]);
  });
});

describe('hasAfternoonStarted', () => {
  it.each([
    ['00:00', false],
    ['11:59', false],
    ['12:00', true],
    ['23:59', true],
  ])('%s is %s in business time', (hhmm, expected) => {
    expect(hasAfternoonStarted(new Date(at(hhmm)), TZ)).toBe(expected);
  });
});
