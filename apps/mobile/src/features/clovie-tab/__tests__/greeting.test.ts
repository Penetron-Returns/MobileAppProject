import { greetingPeriod, greetingText } from '../greeting';

const TZ = 'Africa/Johannesburg'; // UTC+2, no DST
const at = (hhmm: string) => new Date(`2026-10-17T${hhmm}:00+02:00`);

describe('greetingPeriod', () => {
  it.each([
    ['04:59', 'lateNight'],
    ['05:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['17:59', 'afternoon'],
    ['18:00', 'evening'],
    ['21:59', 'evening'],
    ['22:00', 'lateNight'],
    ['00:00', 'lateNight'],
  ])('%s is %s', (time, expected) => {
    expect(greetingPeriod(at(time), TZ)).toBe(expected);
  });

  it('uses the business timezone, not the device clock', () => {
    const instant = new Date('2026-10-17T22:30:00Z');
    expect(greetingPeriod(instant, 'Africa/Johannesburg')).toBe('lateNight'); // 00:30
    expect(greetingPeriod(instant, 'America/New_York')).toBe('evening'); // 18:30
  });
});

describe('greetingText', () => {
  it('names the person', () => {
    expect(greetingText(at('09:00'), TZ, 'Colin')).toEqual({
      key: 'clovieTab.greeting.morning',
      values: { name: 'Colin' },
    });
  });

  it('drops the name when Clerk has none', () => {
    expect(greetingText(at('19:00'), TZ, null).key).toBe(
      'clovieTab.greeting.eveningNoName',
    );
    expect(greetingText(at('19:00'), TZ, '  ').key).toBe(
      'clovieTab.greeting.eveningNoName',
    );
  });
});
