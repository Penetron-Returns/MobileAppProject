import { openDaysSummary } from '../summaries';

const days = (...weekdays: number[]) =>
  weekdays.map((weekday) => ({ weekday }));

describe('openDaysSummary', () => {
  it.each([
    ['an unbroken run of three or more', days(1, 2, 3, 4, 5, 6), 'Mon–Sat'],
    ['a week that runs over Sunday', days(1, 2, 3, 4, 5, 6, 0), 'Mon–Sun'],
    ['two days', days(1, 2), 'Mon, Tue'],
    ['a gap', days(1, 3, 5), 'Mon, Wed, Fri'],
    ['several ranges on one day', days(2, 2, 3, 3, 4), 'Tue–Thu'],
    ['a Sunday-only business', days(0), 'Sun'],
  ])('summarises %s', (_name, rows, expected) => {
    expect(openDaysSummary(rows)).toBe(expected);
  });

  it('is null when the business never opens', () => {
    expect(openDaysSummary([])).toBeNull();
  });
});
