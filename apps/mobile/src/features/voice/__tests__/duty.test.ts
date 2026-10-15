import type { BusinessHoursRow } from '@booking/types';

import { zonedTimeToUtc } from '@/lib/zoned';

import {
  DEFAULT_CONDITIONS,
  dutyWindows,
  evaluateDuty,
  flattenWindows,
  type DutyConditions,
  type DutyInput,
  type DutyWindow,
} from '../duty';

const TZ = 'Africa/Johannesburg'; // UTC+2, no daylight saving
const at = (date: string, time: string) =>
  zonedTimeToUtc(date, time, TZ).getTime();

// Mon-Fri 08:00-18:00, Sat 09:00-13:00, Sunday closed.
const HOURS: BusinessHoursRow[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    opens_at: '08:00',
    closes_at: '18:00',
  })),
  { weekday: 6, opens_at: '09:00', closes_at: '13:00' },
];

// Monday 12 October 2026.
const FROM = '2026-10-12';

type Specials = Parameters<typeof dutyWindows>[0]['specialDays'];

function windows(specialDays: Specials = []) {
  return dutyWindows({
    hours: HOURS,
    specialDays,
    timezone: TZ,
    from: FROM,
    days: 14,
  });
}

const CLOSED_WEDNESDAY: Specials = [
  { date: '2026-10-14', is_closed: true, start_time: null, end_time: null },
];

describe('dutyWindows', () => {
  it('builds one window per open day and skips Sundays', () => {
    const w = windows();
    expect(w).toHaveLength(12); // 2 weeks x (5 weekdays + Saturday)
    expect(w[0]).toEqual({
      start: at('2026-10-12', '08:00'),
      end: at('2026-10-12', '18:00'),
    });
    expect(w[5]).toEqual({
      start: at('2026-10-17', '09:00'),
      end: at('2026-10-17', '13:00'),
    });
    expect(w[6].start).toBe(at('2026-10-19', '08:00'));
  });

  it('drops a closure or public holiday', () => {
    const w = windows(CLOSED_WEDNESDAY);
    expect(w).toHaveLength(11);
    expect(w.some((x) => x.start === at('2026-10-14', '08:00'))).toBe(false);
  });

  it('replaces a day with its special hours', () => {
    const w = windows([
      {
        date: '2026-10-14',
        is_closed: false,
        start_time: '10:00',
        end_time: '14:00',
      },
    ]);
    expect(w[2]).toEqual({
      start: at('2026-10-14', '10:00'),
      end: at('2026-10-14', '14:00'),
    });
  });

  it('opens a normally closed Sunday with special hours', () => {
    const w = windows([
      {
        date: '2026-10-18',
        is_closed: false,
        start_time: '09:00:00',
        end_time: '12:00:00',
      },
    ]);
    expect(w.some((x) => x.start === at('2026-10-18', '09:00'))).toBe(true);
  });

  it('reads a closing time of 00:00 as the midnight that ends the day', () => {
    const w = dutyWindows({
      hours: [{ weekday: 5, opens_at: '18:00', closes_at: '00:00' }],
      specialDays: [],
      timezone: TZ,
      from: '2026-10-16', // Friday
      days: 1,
    });
    expect(w).toEqual([
      { start: at('2026-10-16', '18:00'), end: at('2026-10-17', '00:00') },
    ]);
  });

  it('merges windows that touch (a split shift with no gap)', () => {
    const w = dutyWindows({
      hours: [
        { weekday: 1, opens_at: '08:00', closes_at: '12:00' },
        { weekday: 1, opens_at: '12:00', closes_at: '17:00' },
      ],
      specialDays: [],
      timezone: TZ,
      from: FROM,
      days: 1,
    });
    expect(w).toEqual([{ start: at(FROM, '08:00'), end: at(FROM, '17:00') }]);
  });

  it('handles no hours at all', () => {
    expect(
      dutyWindows({
        hours: [],
        specialDays: [],
        timezone: TZ,
        from: FROM,
        days: 7,
      }),
    ).toEqual([]);
  });

  it('flattens windows for the native side', () => {
    const w: DutyWindow[] = [
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ];
    expect(flattenWindows(w)).toEqual([1, 2, 3, 4]);
  });
});

describe('evaluateDuty with opening hours (the default)', () => {
  const w = windows(CLOSED_WEDNESDAY);
  const run = (date: string, time: string, extra: Partial<DutyInput> = {}) =>
    evaluateDuty({
      windows: w,
      conditions: DEFAULT_CONDITIONS,
      isCharging: false,
      now: at(date, time),
      ...extra,
    });

  it.each([
    [
      'one minute before opening',
      '2026-10-12',
      '07:59',
      'off_hours',
      at('2026-10-12', '08:00'),
    ],
    ['at opening', '2026-10-12', '08:00', 'on_duty', at('2026-10-12', '18:00')],
    [
      'just before closing',
      '2026-10-12',
      '17:59',
      'on_duty',
      at('2026-10-12', '18:00'),
    ],
    [
      'at closing',
      '2026-10-12',
      '18:00',
      'off_hours',
      at('2026-10-13', '08:00'),
    ],
    [
      'at midnight',
      '2026-10-13',
      '00:00',
      'off_hours',
      at('2026-10-13', '08:00'),
    ],
    [
      'the evening before a closure skips the closed day',
      '2026-10-13',
      '18:00',
      'off_hours',
      at('2026-10-15', '08:00'),
    ],
    [
      'during a closure',
      '2026-10-14',
      '12:00',
      'off_hours',
      at('2026-10-15', '08:00'),
    ],
    [
      'Saturday morning',
      '2026-10-17',
      '09:30',
      'on_duty',
      at('2026-10-17', '13:00'),
    ],
    [
      'Saturday afternoon runs to Monday',
      '2026-10-17',
      '13:00',
      'off_hours',
      at('2026-10-19', '08:00'),
    ],
    [
      'on a Sunday',
      '2026-10-18',
      '12:00',
      'off_hours',
      at('2026-10-19', '08:00'),
    ],
  ])('%s', (_label, date, time, state, until) => {
    expect(run(date, time)).toEqual({ state, until });
  });

  it('has no next opening once the handed-over windows run out', () => {
    expect(run('2026-10-26', '20:00')).toEqual({
      state: 'off_hours',
      until: null,
    });
  });

  it('is off with no windows at all', () => {
    expect(
      evaluateDuty({
        windows: [],
        conditions: DEFAULT_CONDITIONS,
        isCharging: true,
        now: at(FROM, '12:00'),
      }),
    ).toEqual({ state: 'off_hours', until: null });
  });

  it('does not care about the charger by default', () => {
    expect(run('2026-10-12', '12:00', { isCharging: true }).state).toBe(
      'on_duty',
    );
    expect(run('2026-10-12', '12:00', { isCharging: false }).state).toBe(
      'on_duty',
    );
  });
});

describe('evaluateDuty conditions', () => {
  const w = windows();
  const run = (conditions: DutyConditions, time: string, isCharging: boolean) =>
    evaluateDuty({ windows: w, conditions, isCharging, now: at(FROM, time) });

  const ALWAYS = { useOpeningHours: false, onlyWhileCharging: false };
  const CHARGER = { useOpeningHours: false, onlyWhileCharging: true };
  const BOTH = { useOpeningHours: true, onlyWhileCharging: true };

  it.each([
    ['always, any time', ALWAYS, '03:00', false, 'on_duty', null],
    [
      'charger only, plugged in at night',
      CHARGER,
      '03:00',
      true,
      'on_duty',
      null,
    ],
    [
      'charger only, on battery',
      CHARGER,
      '12:00',
      false,
      'waiting_charger',
      null,
    ],
    [
      'hours and charger, open and plugged in',
      BOTH,
      '12:00',
      true,
      'on_duty',
      at(FROM, '18:00'),
    ],
    [
      'hours and charger, open on battery',
      BOTH,
      '12:00',
      false,
      'waiting_charger',
      null,
    ],
    [
      'hours and charger, closed and plugged in',
      BOTH,
      '20:00',
      true,
      'off_hours',
      at('2026-10-13', '08:00'),
    ],
  ])('%s', (_label, conditions, time, isCharging, state, until) => {
    expect(run(conditions, time, isCharging)).toEqual({ state, until });
  });
});

describe('evaluateDuty pause and stop', () => {
  const base = {
    windows: windows(),
    conditions: DEFAULT_CONDITIONS,
    isCharging: false,
  };

  it('pauses until the given time, even in opening hours', () => {
    const pausedUntil = at(FROM, '13:00');
    expect(
      evaluateDuty({ ...base, now: at(FROM, '12:00'), pausedUntil }),
    ).toEqual({ state: 'paused', until: pausedUntil });
  });

  it('resumes when the pause has passed', () => {
    expect(
      evaluateDuty({
        ...base,
        now: at(FROM, '13:00'),
        pausedUntil: at(FROM, '13:00'),
      }).state,
    ).toBe('on_duty');
  });

  it('is stopped when hands-free is switched off', () => {
    expect(
      evaluateDuty({ ...base, now: at(FROM, '12:00'), isEnabled: false }),
    ).toEqual({ state: 'stopped', until: null });
  });
});
