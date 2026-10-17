import { Easing } from 'react-native-reanimated';

/** The board's `--spring` and `--pop` curves. */
export const EASE_SPRING = Easing.bezier(0.32, 0.72, 0, 1);
export const EASE_POP = Easing.bezier(0.34, 1.56, 0.64, 1);

/** A plain 5 pt-per-ms-style triangle wave, eased, for the demo equaliser bars. */
export function barScale(timeMs: number, durMs: number, delayMs: number) {
  'worklet';
  const x = (timeMs - delayMs) / durMs;
  const ph = ((x % 2) + 2) % 2;
  const tri = ph < 1 ? ph : 2 - ph;
  const e = tri * tri * (3 - 2 * tri);
  return 0.3 + 0.7 * e;
}
