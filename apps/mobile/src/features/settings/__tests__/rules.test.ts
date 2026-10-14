import {
  DEFAULT_RULES,
  minutesToParts,
  parseRules,
  sameOffsets,
} from '../rules';

describe('parseRules', () => {
  it('returns the defaults for anything that is not an object', () => {
    expect(parseRules(null)).toEqual(DEFAULT_RULES);
    expect(parseRules([1, 2])).toEqual(DEFAULT_RULES);
    expect(parseRules('x')).toEqual(DEFAULT_RULES);
  });

  it('keeps stored values and fills the missing ones', () => {
    const rules = parseRules({
      buffer_minutes: 10,
      allow_staff_selection: false,
    });
    expect(rules.buffer_minutes).toBe(10);
    expect(rules.allow_staff_selection).toBe(false);
    expect(rules.lead_time_minutes).toBe(60);
  });

  it('ignores values of the wrong type', () => {
    const rules = parseRules({
      lead_time_minutes: '30',
      allow_staff_selection: 'yes',
      reminder_offsets_minutes: [120, 'x', -5, 1440],
    });
    expect(rules.lead_time_minutes).toBe(60);
    expect(rules.allow_staff_selection).toBe(true);
    expect(rules.reminder_offsets_minutes).toEqual([1440, 120]);
  });

  it('allows no reminders', () => {
    expect(
      parseRules({ reminder_offsets_minutes: [] }).reminder_offsets_minutes,
    ).toEqual([]);
  });
});

describe('minutesToParts', () => {
  it.each([
    [30, { unit: 'minutes', count: 30 }],
    [60, { unit: 'hours', count: 1 }],
    [120, { unit: 'hours', count: 2 }],
    [90, { unit: 'minutes', count: 90 }],
    [1440, { unit: 'days', count: 1 }],
    [2880, { unit: 'days', count: 2 }],
    [0, { unit: 'minutes', count: 0 }],
  ])('%i minutes', (minutes, expected) => {
    expect(minutesToParts(minutes)).toEqual(expected);
  });
});

describe('sameOffsets', () => {
  it('compares in order', () => {
    expect(sameOffsets([1440, 120], [1440, 120])).toBe(true);
    expect(sameOffsets([120], [1440])).toBe(false);
    expect(sameOffsets([], [])).toBe(true);
  });
});
