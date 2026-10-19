import i18n from '@/lib/i18n';

import { answerInstant, type InstantDeps, type InstantEvent } from '../answer';
import { composeAnswer } from '../compose';
import { matchInstantIntent } from '../match';
import type { InstantAppointment, InstantData } from '../types';

const t: InstantDeps['t'] = (key, values) => i18n.t(key, values) as string;
const TZ = 'America/New_York';
// 10:00 in New York (EDT, UTC-4)
const NOW = new Date('2026-10-19T14:00:00Z');

function appt(
  id: string,
  client: string | null,
  startLocal: string,
  endLocal: string,
  extra: Partial<InstantAppointment> = {},
): InstantAppointment {
  const iso = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2026, 9, 19, h + 4, m)).toISOString();
  };
  return {
    id,
    starts_at: iso(startLocal),
    ends_at: iso(endLocal),
    status: 'confirmed',
    checked_in_at: null,
    client: client ? { name: client } : null,
    ...extra,
  };
}

const DAY: InstantData = {
  timezone: TZ,
  appointments: [
    appt('a1', 'Jake Miller', '09:00', '09:45', { status: 'completed' }),
    appt('a2', 'Mia Chen', '10:30', '11:15', {
      staff: { name: 'Emma' },
      service: { name: 'Colour' },
    }),
    appt('a3', 'Olivia Brown', '16:30', '17:30', {
      staff: { name: 'Sam' },
      service: { name: 'Haircut' },
    }),
    appt('a4', 'Zoe Park', '12:00', '12:30', { status: 'cancelled' }),
    appt('a5', 'Mia Stone', '14:00', '14:30', { staff: { name: 'Emma' } }),
  ],
};
const EMPTY: InstantData = { timezone: TZ, appointments: [] };

function say(
  text: string,
  data: InstantData = DAY,
  options: { now?: Date; h12?: boolean } = {},
) {
  const intent = matchInstantIntent(text);
  if (!intent) throw new Error(`no intent for ${text}`);
  return composeAnswer(intent, data, {
    now: options.now ?? NOW,
    t,
    h12: options.h12 ?? true,
  });
}

describe('composeAnswer', () => {
  it.each([
    ['who is next', 'Your next client is Mia Chen at 10:30 AM, for Colour.'],
    [
      'how many bookings do I have today',
      'You have 4 bookings today. 3 still to come.',
    ],
    [
      'what is my first appointment',
      'Your first booking is Jake Miller at 9:00 AM.',
    ],
    [
      'who is my last client',
      'Your last booking is Olivia Brown at 4:30 PM, for Haircut.',
    ],
    [
      'am I free at 3',
      "You're free at 3:00 PM. Your next booking is Olivia Brown at 4:30 PM.",
    ],
    ['am I free at 2', 'At 2:00 PM you have Mia Stone, until 2:30 PM.'],
    ['am I free at 5 pm', 'At 5:00 PM you have Olivia Brown, until 5:30 PM.'],
    [
      'am I free at 6 pm',
      "You're free at 6:00 PM. You have nothing else booked today.",
    ],
    [
      'am I free now',
      "You're free right now. Your next booking is Mia Chen at 10:30 AM.",
    ],
    ['when is Jake coming', 'Jake Miller was booked at 9:00 AM.'],
    ['what time is Olivia', 'Olivia Brown is booked at 4:30 PM.'],
    [
      'when is Mia coming',
      'I found 2 bookings: Mia Chen at 10:30 AM and Mia Stone at 2:00 PM.',
    ],
  ])('%s', (text, expected) => {
    expect(say(text)).toBe(expected);
  });

  it('answers a staff member from their own bookings', () => {
    expect(say('is Emma free at 3')).toBe(
      'Emma is free at 3:00 PM. They have nothing else booked today.',
    );
    expect(say('is Emma free at 2')).toBe(
      'At 2:00 PM Emma has Mia Stone, until 2:30 PM.',
    );
    expect(say('is Sam free at 3')).toBe(
      'Sam is free at 3:00 PM. Their next booking is Olivia Brown at 4:30 PM.',
    );
  });

  it("falls through for a staff member it cannot find in today's data", () => {
    expect(say('is Priya free at 3')).toBeNull();
  });

  it('falls through for a client who is not booked today', () => {
    expect(say('when is Priya coming')).toBeNull();
  });

  it('falls through for a time that has already passed', () => {
    expect(say('am I free at 9 am')).toBeNull();
  });

  it('speaks 24-hour times when the phone uses them', () => {
    expect(say('who is next', DAY, { h12: false })).toBe(
      'Your next client is Mia Chen at 10:30, for Colour.',
    );
    expect(say('am I free at 15:00', DAY, { h12: false })).toBe(
      "You're free at 15:00. Your next booking is Olivia Brown at 16:30.",
    );
  });

  it('says who the owner is with right now', () => {
    const during = new Date('2026-10-19T14:45:00Z'); // 10:45
    expect(say('am I free now', DAY, { now: during })).toBe(
      "You're with Mia Chen right now, until 11:15 AM.",
    );
    expect(say('is Emma free now', DAY, { now: during })).toBe(
      'Emma is with Mia Chen right now, until 11:15 AM.',
    );
  });

  it('counts overlapping bookings (several staff) at one time', () => {
    const data: InstantData = {
      timezone: TZ,
      appointments: [
        appt('x1', 'Ann', '15:00', '16:00'),
        appt('x2', 'Bo', '15:30', '16:30'),
      ],
    };
    expect(say('am I free at 3:45', data)).toBe(
      'At 3:45 PM you have 2 bookings, the last one until 4:30 PM.',
    );
  });

  it('is helpful on an empty day', () => {
    expect(say('who is next', EMPTY)).toBe('You have no bookings today.');
    expect(say('how many bookings do I have today', EMPTY)).toBe(
      'You have no bookings today.',
    );
    expect(say('what is my first appointment', EMPTY)).toBe(
      'You have no bookings today.',
    );
    expect(say('am I free at 3', EMPTY)).toBe(
      "You're free at 3:00 PM. You have nothing else booked today.",
    );
  });

  it('says the day is done once the last client has gone', () => {
    const evening = new Date('2026-10-19T22:00:00Z'); // 18:00
    expect(say('who is next', DAY, { now: evening })).toBe(
      'No more clients today.',
    );
    expect(
      say('how many bookings do I have today', DAY, { now: evening }),
    ).toBe('You have 4 bookings today. They are all done.');
  });

  it('uses the singular for one booking and ignores cancelled and no-show bookings', () => {
    const data: InstantData = {
      timezone: TZ,
      appointments: [
        appt('o1', 'Ann', '15:00', '16:00'),
        appt('o2', 'Bo', '15:00', '16:00', { status: 'cancelled' }),
        appt('o3', 'Cy', '15:00', '16:00', { status: 'no_show' }),
      ],
    };
    expect(say('how many appointments today', data)).toBe(
      'You have 1 booking today.',
    );
  });

  it('shows checked-in clients as here and names unknown clients', () => {
    const data: InstantData = {
      timezone: TZ,
      appointments: [
        appt('c1', 'Jake Miller', '09:30', '10:30', {
          checked_in_at: '2026-10-19T13:25:00Z',
        }),
        appt('c2', null, '11:00', '11:30'),
      ],
    };
    expect(say('when is Jake coming', data)).toBe(
      'Jake Miller is here, checked in for 9:30 AM.',
    );
    expect(say('who is next', data)).toBe(
      'Your next client is Walk-in client at 11:00 AM.',
    );
  });
});

describe('answerInstant', () => {
  const events: InstantEvent[] = [];
  const base = (patch: Partial<InstantDeps> = {}): InstantDeps => {
    let tick = 0;
    return {
      now: () => NOW,
      t,
      h12: true,
      load: jest.fn(async () => DAY),
      report: (e) => events.push(e),
      clock: () => (tick += 40),
      ...patch,
    };
  };
  beforeEach(() => {
    events.length = 0;
  });

  it('answers from freshly loaded data and reports no text', async () => {
    const deps = base();
    await expect(answerInstant('who is next', deps)).resolves.toBe(
      'Your next client is Mia Chen at 10:30 AM, for Colour.',
    );
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ intent: 'next', answered: true, ms: 40 }]);
  });

  it('does not touch the network for a sentence it does not know', async () => {
    const deps = base();
    await expect(answerInstant('move Jake to four', deps)).resolves.toBeNull();
    expect(deps.load).not.toHaveBeenCalled();
    expect(events).toEqual([{ intent: 'none', answered: false, ms: 40 }]);
  });

  it('uses a recent snapshot without loading', async () => {
    const deps = base({
      cached: () => ({ data: DAY, loadedAt: NOW.getTime() - 60_000 }),
    });
    await expect(answerInstant('who is next', deps)).resolves.toContain('Mia');
    expect(deps.load).not.toHaveBeenCalled();
  });

  it('reloads a stale snapshot, and still skips the LLM', async () => {
    const fresh: InstantData = { timezone: TZ, appointments: [] };
    const deps = base({
      cached: () => ({ data: DAY, loadedAt: NOW.getTime() - 10 * 60_000 }),
      load: jest.fn(async () => fresh),
    });
    await expect(answerInstant('who is next', deps)).resolves.toBe(
      'You have no bookings today.',
    );
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it('falls through when offline (the load fails)', async () => {
    const deps = base({
      load: jest.fn(async () => Promise.reject(new Error('offline'))),
    });
    await expect(answerInstant('who is next', deps)).resolves.toBeNull();
    expect(events[0]).toMatchObject({ intent: 'next', answered: false });
  });

  it('falls through when the load is too slow', async () => {
    jest.useFakeTimers();
    try {
      const deps = base({
        load: () => new Promise<InstantData>(() => undefined),
      });
      const pending = answerInstant('who is next', deps);
      await jest.advanceTimersByTimeAsync(2_500);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('falls through when today cannot answer (unknown client)', async () => {
    await expect(
      answerInstant('when is Priya coming', base()),
    ).resolves.toBeNull();
    expect(events[0]).toMatchObject({ intent: 'client_time', answered: false });
  });
});
