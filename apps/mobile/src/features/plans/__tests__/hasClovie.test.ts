import { hasClovie } from '../logic';

describe('hasClovie', () => {
  it.each([
    ['free', false, false],
    ['none', false, false],
    [null, false, false],
    ['starter', false, true],
    ['growth', false, true],
    ['pro', false, true],
    ['free', true, true],
    ['none', true, true],
    [null, true, true],
  ] as const)(
    'plan %s, companion feature %s -> %s',
    (plan, hasCompanion, expected) => {
      expect(hasClovie({ plan, hasCompanion })).toBe(expected);
    },
  );
});
