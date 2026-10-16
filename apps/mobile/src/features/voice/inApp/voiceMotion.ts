import { EASING } from '@booking/ui';
import {
  cancelAnimation,
  ReduceMotion,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Looping motion for the drawer, used only while `isLive` (visible, foreground, Reduce Motion off: see
 * `useMotionActive`). A held value schedules no frames, so a drawer that is not live costs nothing.
 */
export function startLoop(
  value: SharedValue<number>,
  options: {
    from: number;
    to: number;
    durationMs: number;
    phase?: number;
    /** Alternate back and forth (default), or jump back and repeat (a ring). */
    reverse?: boolean;
  },
): void {
  const { from, to, durationMs, phase = 0, reverse = true } = options;
  cancelAnimation(value);
  value.value = from + (to - from) * phase;
  value.value = withRepeat(
    withTiming(to, {
      duration: durationMs,
      easing: EASING.inOut,
      reduceMotion: ReduceMotion.System,
    }),
    -1,
    reverse,
    undefined,
    ReduceMotion.System,
  );
}

/** Stops whatever is running and rests the value at `at`. */
export function holdAt(value: SharedValue<number>, at: number): void {
  cancelAnimation(value);
  value.value = at;
}

/** The share of a loop already elapsed for a negative CSS animation delay (the board's `--dl`). */
export function phaseFromDelay(delaySeconds: number, periodSeconds: number) {
  if (periodSeconds <= 0) return 0;
  const phase = (-delaySeconds / periodSeconds) % 1;
  return phase < 0 ? phase + 1 : phase;
}
