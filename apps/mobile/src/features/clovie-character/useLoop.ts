import * as React from 'react';
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * A 0..1 shared value that repeats every `durationMs` while `isRunning`, on the
 * UI thread. The delay applies once, like a CSS `animation-delay`. When it is
 * not running nothing is scheduled and the value rests at 0, which is how a
 * resting screen costs zero frames.
 */
export function useLoop(durationMs: number, isRunning: boolean, delayMs = 0) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    cancelAnimation(t);
    t.value = 0;
    if (!isRunning || durationMs <= 0) return;
    t.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, { duration: durationMs, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [t, durationMs, isRunning, delayMs]);
  return t;
}
