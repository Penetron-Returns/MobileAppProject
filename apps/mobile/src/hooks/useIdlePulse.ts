import * as React from 'react';
import {
  cancelAnimation,
  type SharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface IdlePulseOptions {
  /** Whether the pulse may run at all (see `useMotionActive`). */
  isActive: boolean;
  /** Timing config for each half (up, then down). */
  half: { duration: number };
  /** Pause between pulses. No frames are scheduled while resting. */
  restMs: number;
}

/**
 * Drives `value` 0 -> 1 -> 0 once, then rests `restMs` before the next pulse.
 * A `withRepeat(-1)` loop schedules a frame every vsync forever; this one is
 * idle between pulses, so calm motion costs a few frames every few seconds.
 * While inactive the value rests at 0.
 */
export function useIdlePulse(
  value: SharedValue<number>,
  { isActive, half, restMs }: IdlePulseOptions,
): void {
  React.useEffect(() => {
    if (!isActive) {
      cancelAnimation(value);
      value.value = 0;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pulse = () => {
      value.value = withSequence(withTiming(1, half), withTiming(0, half));
      timer = setTimeout(pulse, half.duration * 2 + restMs);
    };
    pulse();
    return () => {
      if (timer) clearTimeout(timer);
      cancelAnimation(value);
    };
  }, [isActive, value, half, restMs]);
}
