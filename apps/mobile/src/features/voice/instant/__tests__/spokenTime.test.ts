import { parseSpokenTime, resolveSpokenTime } from '../spokenTime';
import type { SpokenTime } from '../types';

const clock = (
  hour: number,
  minute: number,
  meridiem?: 'am' | 'pm',
): SpokenTime =>
  meridiem
    ? { kind: 'clock', hour, minute, meridiem }
    : { kind: 'clock', hour, minute };

describe('parseSpokenTime', () => {
  it.each<[string, SpokenTime | null]>([
    ['3', clock(3, 0)],
    ['at 3', clock(3, 0)],
    ['three', clock(3, 0)],
    ['3pm', clock(3, 0, 'pm')],
    ['3 pm', clock(3, 0, 'pm')],
    ['3 p m', clock(3, 0, 'pm')],
    ['3 p.m.', clock(3, 0, 'pm')],
    ['11am', clock(11, 0, 'am')],
    ['12 am', clock(12, 0, 'am')],
    ['15:30', clock(15, 30)],
    ['3:30', clock(3, 30)],
    ['3:30 pm', clock(3, 30, 'pm')],
    ['0:15', clock(0, 15)],
    ['1530', clock(15, 30)],
    ['three thirty', clock(3, 30)],
    ['three forty five', clock(3, 45)],
    ['three oh five', clock(3, 5)],
    ["three o'clock", clock(3, 0)],
    ['half past three', clock(3, 30)],
    ['half past three pm', clock(3, 30, 'pm')],
    ['quarter past three', clock(3, 15)],
    ['quarter to four', clock(4, -15)],
    ['ten past two', clock(2, 10)],
    ['twenty five to five', clock(5, -25)],
    ['five to twelve', clock(12, -5)],
    ['3 this afternoon', clock(3, 0, 'pm')],
    ['nine in the morning', clock(9, 0, 'am')],
    ['noon', clock(12, 0, 'pm')],
    ['midday', clock(12, 0, 'pm')],
    ['midnight', clock(12, 0, 'am')],
    ['now', { kind: 'now' }],
    ['right now', { kind: 'now' }],
    ['', null],
    ['pm', null],
    ['25', null],
    ['15 pm', null],
    ['0 pm', null],
    ['3:75', null],
    ['3 30', null],
    ['half past', null],
    ['half to four', null],
    ['quarter to thirteen', null],
    ['three banana', null],
    ['twenty', null],
    ['lunchtime', null],
    ['tomorrow at 3', null],
  ])('%j', (input, expected) => {
    expect(parseSpokenTime(input)).toEqual(expected);
  });
});

describe('resolveSpokenTime', () => {
  const NY = 'America/New_York';
  // 10:00 in New York (EDT, UTC-4)
  const MORNING = new Date('2026-10-19T14:00:00Z');
  const resolve = (time: SpokenTime | null, now = MORNING, tz = NY) =>
    time ? resolveSpokenTime(time, { now, timezone: tz }) : null;

  it.each([
    ['3', 15 * 60, '2026-10-19T19:00:00.000Z'],
    ['3 pm', 15 * 60, '2026-10-19T19:00:00.000Z'],
    ['15:30', 15 * 60 + 30, '2026-10-19T19:30:00.000Z'],
    ['quarter to four', 15 * 60 + 45, '2026-10-19T19:45:00.000Z'],
    ['half past three', 15 * 60 + 30, '2026-10-19T19:30:00.000Z'],
    ['noon', 12 * 60, '2026-10-19T16:00:00.000Z'],
    // 7 to 12 mean the morning first, and 11:00 is still ahead at 10:00
    ['11', 11 * 60, '2026-10-19T15:00:00.000Z'],
  ])('%s in the business timezone', (text, minutes, iso) => {
    const resolved = resolve(parseSpokenTime(text));
    expect(resolved?.minutes).toBe(minutes);
    expect(resolved?.at.toISOString()).toBe(iso);
  });

  it('uses the later half of the day when the likelier one has passed', () => {
    const late = new Date('2026-10-19T14:30:00Z'); // 10:30
    expect(resolve(parseSpokenTime('10'), late)?.minutes).toBe(22 * 60);
    expect(resolve(parseSpokenTime('7'), late)?.minutes).toBe(19 * 60);
  });

  it('is null for a time already past', () => {
    expect(resolve(parseSpokenTime('9 am'))).toBeNull();
    expect(resolve(parseSpokenTime('8:00 am'))).toBeNull();
    expect(resolve(parseSpokenTime('midnight'))).toBeNull();
  });

  it('treats the current minute as now', () => {
    expect(resolve(parseSpokenTime('10:00'))?.minutes).toBe(600);
    expect(resolve({ kind: 'now' })?.at).toEqual(MORNING);
  });

  it('resolves midnight at the start of the day', () => {
    const justAfter = new Date('2026-10-19T04:00:00Z'); // 00:00 EDT
    expect(resolve(parseSpokenTime('midnight'), justAfter)?.minutes).toBe(0);
    expect(resolve(parseSpokenTime('12 am'), justAfter)?.at.toISOString()).toBe(
      '2026-10-19T04:00:00.000Z',
    );
  });

  it('says 12:30 means half past noon', () => {
    expect(resolve(parseSpokenTime('12:30'))?.minutes).toBe(12 * 60 + 30);
  });

  it('handles the spring-forward day: the skipped hour does not exist', () => {
    const early = new Date('2027-03-14T05:00:00Z'); // 00:00 EST, clocks jump 02:00 -> 03:00
    expect(resolve(parseSpokenTime('2:30 am'), early)).toBeNull();
    expect(resolve(parseSpokenTime('3:30 am'), early)?.at.toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
    // The afternoon is in EDT already: 15:00 is 19:00Z, not 20:00Z
    expect(resolve(parseSpokenTime('3'), early)?.at.toISOString()).toBe(
      '2027-03-14T19:00:00.000Z',
    );
  });

  it('handles the fall-back day: the repeated hour resolves to one instant', () => {
    const early = new Date('2026-11-01T04:00:00Z'); // 00:00 EDT
    const resolved = resolve(parseSpokenTime('1:30 am'), early);
    expect(resolved?.minutes).toBe(90);
  });

  it('works in a timezone ahead of UTC (the date rolls over at local midnight)', () => {
    const tz = 'Pacific/Auckland';
    // 2026-10-19T20:30Z is 09:30 on the 20th in Auckland (NZDT, UTC+13)
    const now = new Date('2026-10-19T20:30:00Z');
    const resolved = resolve(parseSpokenTime('4 pm'), now, tz);
    expect(resolved?.at.toISOString()).toBe('2026-10-20T03:00:00.000Z');
  });
});
