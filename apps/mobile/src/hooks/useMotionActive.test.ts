import { shouldRunMotion } from './useMotionActive';

describe('shouldRunMotion', () => {
  it.each([
    [true, true, false, true],
    [false, true, false, false],
    [true, false, false, false],
    [true, true, true, false],
  ])(
    'focused=%s foreground=%s reduce=%s -> %s',
    (isFocused, isForeground, reduceMotion, expected) => {
      expect(shouldRunMotion({ isFocused, isForeground, reduceMotion })).toBe(
        expected,
      );
    },
  );
});
