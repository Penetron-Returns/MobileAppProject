import {
  nameMatches,
  pickAppointmentToCheckIn,
  type CheckInCandidate,
} from '../checkIn';

// 10:00 in Johannesburg (UTC+2) is 08:00Z; the clock is injected, never read.
const NOW = new Date('2026-10-15T08:00:00Z');

function appt(
  id: string,
  startsAt: string,
  patch: Partial<CheckInCandidate> = {},
): CheckInCandidate {
  const start = Date.parse(startsAt);
  return {
    id,
    starts_at: startsAt,
    ends_at: new Date(start + 45 * 60_000).toISOString(),
    status: 'confirmed',
    checked_in_at: null,
    client: { name: 'Someone Else' },
    ...patch,
  };
}

const idOf = (pick: ReturnType<typeof pickAppointmentToCheckIn>) =>
  pick.kind === 'match' ? pick.appointment.id : pick.reason;

describe('pickAppointmentToCheckIn', () => {
  it('picks the appointment that started closest to now', () => {
    const list = [
      appt('late', '2026-10-15T07:30:00Z'),
      appt('near', '2026-10-15T07:50:00Z'),
    ];
    expect(idOf(pickAppointmentToCheckIn(list, { now: NOW }))).toBe('near');
  });

  it('picks one starting within 15 minutes, but not 16', () => {
    expect(
      idOf(
        pickAppointmentToCheckIn([appt('a', '2026-10-15T08:15:00Z')], {
          now: NOW,
        }),
      ),
    ).toBe('a');
    expect(
      idOf(
        pickAppointmentToCheckIn([appt('a', '2026-10-15T08:16:00Z')], {
          now: NOW,
        }),
      ),
    ).toBe('no_appointment');
  });

  it('prefers a booking about to start over one that started long ago', () => {
    const list = [
      appt('earlier', '2026-10-15T07:20:00Z'),
      appt('soon', '2026-10-15T08:10:00Z'),
    ];
    expect(idOf(pickAppointmentToCheckIn(list, { now: NOW }))).toBe('soon');
  });

  it.each([
    ['already checked in', { checked_in_at: '2026-10-15T07:55:00Z' }],
    ['cancelled', { status: 'cancelled' }],
    ['completed', { status: 'completed' }],
    ['a no-show', { status: 'no_show' }],
    ['already finished', { ends_at: '2026-10-15T07:59:00Z' }],
  ])('skips an appointment that is %s', (_label, patch) => {
    const list = [appt('a', '2026-10-15T07:50:00Z', patch)];
    expect(idOf(pickAppointmentToCheckIn(list, { now: NOW }))).toBe(
      'no_appointment',
    );
  });

  it('breaks ties by id so the pick is stable', () => {
    const list = [
      appt('b', '2026-10-15T08:05:00Z'),
      appt('a', '2026-10-15T07:55:00Z'),
    ];
    expect(idOf(pickAppointmentToCheckIn(list, { now: NOW }))).toBe('a');
  });

  it('prefers the client whose name was said, even when another is nearer', () => {
    const list = [
      appt('near', '2026-10-15T07:59:00Z', {
        client: { name: 'Sipho Dlamini' },
      }),
      appt('thandi', '2026-10-15T07:40:00Z', {
        client: { name: 'Thandi Mokoena' },
      }),
    ];
    expect(
      idOf(pickAppointmentToCheckIn(list, { now: NOW, name: 'Thandi' })),
    ).toBe('thandi');
  });

  it('matches a name speech recognition got one letter wrong', () => {
    const list = [
      appt('a', '2026-10-15T07:59:00Z', {
        client: { name: 'Thandi Mokoena' },
      }),
    ];
    expect(
      idOf(pickAppointmentToCheckIn(list, { now: NOW, name: 'Tandi' })),
    ).toBe('a');
  });

  it('does not check in someone else when the named client is not due', () => {
    const list = [
      appt('a', '2026-10-15T07:59:00Z', { client: { name: 'Sipho Dlamini' } }),
    ];
    expect(
      idOf(pickAppointmentToCheckIn(list, { now: NOW, name: 'Thandi' })),
    ).toBe('no_name_match');
  });

  it('reports no appointment for an empty day', () => {
    expect(idOf(pickAppointmentToCheckIn([], { now: NOW }))).toBe(
      'no_appointment',
    );
    expect(
      idOf(pickAppointmentToCheckIn([], { now: NOW, name: 'Thandi' })),
    ).toBe('no_appointment');
  });

  it('handles an appointment that starts after midnight UTC', () => {
    const now = new Date('2026-10-15T23:50:00Z');
    const list = [appt('a', '2026-10-16T00:00:00Z')];
    expect(idOf(pickAppointmentToCheckIn(list, { now }))).toBe('a');
  });
});

describe('nameMatches', () => {
  it.each([
    ['Thandi', 'Thandi Mokoena', true],
    ['thandi mokoena', 'Thandi Mokoena', true],
    ['Mokoena', 'Thandi Mokoena', true],
    ['Zoe', 'Zoë Smith', true],
    ['Tandi', 'Thandi Mokoena', true],
    ['Thandi Dlamini', 'Thandi Mokoena', false],
    ['Sam', 'Samuel Jones', true],
    ['Al', 'Alan Jones', false],
    ['Thandi', null, false],
    ['', 'Thandi', false],
  ])('%s vs %s is %s', (spoken, name, expected) => {
    expect(nameMatches(spoken, name)).toBe(expected);
  });
});
