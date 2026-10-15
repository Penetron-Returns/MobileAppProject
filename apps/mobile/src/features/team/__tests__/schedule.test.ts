import {
  dayHours,
  resolveWorkingWeek,
  toWorkingWeek,
  workingDaysSummary,
} from '../schedule';

const rule = (weekday: number, start: string, end: string) => ({
  weekday,
  start_time: `${start}:00`,
  end_time: `${end}:00`,
});

describe('toWorkingWeek', () => {
  it('lists Monday to Sunday with off days empty', () => {
    const week = toWorkingWeek([
      rule(0, '10:00', '12:00'),
      rule(1, '08:00', '17:00'),
    ]);
    expect(week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(week[0].ranges).toEqual([{ from: '08:00', to: '17:00' }]);
    expect(week[1].ranges).toEqual([]);
    expect(week[6].ranges).toEqual([{ from: '10:00', to: '12:00' }]);
  });

  it('sorts split shifts earliest first', () => {
    const [monday] = toWorkingWeek([
      rule(1, '14:00', '18:00'),
      rule(1, '08:00', '12:00'),
    ]);
    expect(monday.ranges.map((r) => r.from)).toEqual(['08:00', '14:00']);
  });

  it('is all off with no rules', () => {
    expect(toWorkingWeek([]).every((d) => d.ranges.length === 0)).toBe(true);
  });
});

describe('dayHours', () => {
  it('joins split shifts and is null when off', () => {
    const [monday, tuesday] = toWorkingWeek([
      rule(1, '08:00', '12:00'),
      rule(1, '14:00', '17:00'),
    ]);
    expect(dayHours(monday, 'to')).toBe('08:00 to 12:00, 14:00 to 17:00');
    expect(dayHours(tuesday, 'to')).toBeNull();
  });
});

describe('workingDaysSummary', () => {
  const week = (days: number[]) =>
    toWorkingWeek(days.map((d) => rule(d, '08:00', '17:00')));

  it.each([
    [[1, 2, 3, 4, 5, 6], 'Mon to Sat, 08:00 to 17:00'],
    [[2, 3, 4, 5, 6], 'Tue to Sat, 08:00 to 17:00'],
    [[1, 3, 5], 'Mon, Wed, Fri, 08:00 to 17:00'],
    [[1, 2], 'Mon, Tue, 08:00 to 17:00'],
    [[6], 'Sat, 08:00 to 17:00'],
  ])('summarises %j as %s', (days, expected) => {
    expect(workingDaysSummary(week(days), 'to')).toBe(expected);
  });

  it('is null with no working days', () => {
    expect(workingDaysSummary(week([]), 'to')).toBeNull();
  });
});

describe('resolveWorkingWeek', () => {
  const hours = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    opens_at: '09:00:00',
    closes_at: '17:30:00',
  }));

  it('uses the person own rules when they have any', () => {
    const { week, inherited } = resolveWorkingWeek(
      [rule(6, '10:00', '14:00')],
      hours,
    );
    expect(inherited).toBe(false);
    expect(week.filter((d) => d.ranges.length).map((d) => d.weekday)).toEqual([
      6,
    ]);
  });

  it('inherits the business hours with zero rules', () => {
    const { week, inherited } = resolveWorkingWeek([], hours);
    expect(inherited).toBe(true);
    expect(workingDaysSummary(week, 'to')).toBe('Mon to Fri, 09:00 to 17:30');
  });

  it('is empty and inherited when the business has no hours either', () => {
    const { week, inherited } = resolveWorkingWeek([], []);
    expect(inherited).toBe(true);
    expect(workingDaysSummary(week, 'to')).toBeNull();
  });
});
