import { zonedTimeToUtc } from '@/lib/zoned';

import { formatDutyTime, handsFreeLine } from '../status';

const TZ = 'Africa/Johannesburg';
const at = (date: string, time: string) =>
  zonedTimeToUtc(date, time, TZ).getTime();

describe('formatDutyTime', () => {
  const now = at('2026-10-15', '12:00'); // Thursday

  it.each([
    ['later today', at('2026-10-15', '18:00'), '18:00'],
    ['tomorrow morning', at('2026-10-16', '08:00'), 'Fri 08:00'],
    [
      'after midnight in the business timezone, not in UTC',
      at('2026-10-16', '00:30'),
      'Fri 00:30',
    ],
    ['Monday', at('2026-10-19', '08:00'), 'Mon 08:00'],
  ])('%s', (_label, instant, expected) => {
    expect(formatDutyTime(instant, now, TZ)).toBe(expected);
  });
});

describe('handsFreeLine', () => {
  const now = at('2026-10-15', '12:00');
  const base = {
    enabled: true,
    useOpeningHours: true,
    onlyWhileCharging: false,
    windowsUntilMs: null,
  };

  it.each([
    [
      { ...base, enabled: false, duty: 'on_duty', untilMs: null },
      { key: 'off' },
    ],
    [
      { ...base, duty: 'on_duty', untilMs: at('2026-10-15', '18:00') },
      { key: 'onDutyUntil', time: '18:00' },
    ],
    [{ ...base, duty: 'on_duty', untilMs: null }, { key: 'onDuty' }],
    [
      { ...base, duty: 'off_hours', untilMs: at('2026-10-16', '08:00') },
      { key: 'offUntil', time: 'Fri 08:00' },
    ],
    [{ ...base, duty: 'off_hours', untilMs: null }, { key: 'offNoOpening' }],
    [
      { ...base, duty: 'waiting_charger', untilMs: null },
      { key: 'waitingCharger' },
    ],
    [
      { ...base, duty: 'paused', untilMs: at('2026-10-15', '13:00') },
      { key: 'pausedUntil', time: '13:00' },
    ],
  ] as const)('%j', (hf, expected) => {
    expect(handsFreeLine(hf, now, TZ)).toEqual(expected);
  });
});
