import {
  bookingsTodayCount,
  displayFirstName,
  buildDigest,
  hasAfternoonStarted,
  digestCounts,
  nowRow,
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

describe('bookingsTodayCount', () => {
  it('counts bookings that are not cancelled', () => {
    const list = [
      { ...appt('a', '09:00', '10:00'), status: 'confirmed' },
      { ...appt('b', '10:00', '11:00'), status: 'cancelled' },
      { ...appt('c', '11:00', '12:00'), status: 'completed' },
    ] as AiAppointment[];
    expect(bookingsTodayCount(list)).toBe(2);
  });

  it('is zero for an empty day', () => {
    expect(bookingsTodayCount([])).toBe(0);
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

describe('displayFirstName', () => {
  it.each([
    ['Thandi Nkosi', 'Thandi'],
    ['  Megan ', 'Megan'],
    [null, null],
    ['', null],
    ['Client 3f9a1c7e2b4d', null],
    ['a1b2c3d4-e5f6-7890-abcd-ef1234567890', null],
    ['E2E Test Booking', null],
  ])('%s -> %s', (input, expected) => {
    expect(displayFirstName(input)).toBe(expected);
  });
});
