import * as React from 'react';
import {
  cancelAnimation,
  useSharedValue,
  withDelay,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
} from 'react-native-reanimated';

/**
 * A 0..1 value that plays once on mount (an entrance). When `isInstant` it is
 * already 1, for Reduce Motion paths that skip the travel.
 */
export function useReveal(
  delayMs: number,
  durationMs: number,
  easing: EasingFunction | EasingFunctionFactory,
  isInstant = false,
) {
  const p = useSharedValue(isInstant ? 1 : 0);
  React.useEffect(() => {
    if (isInstant) {
      p.value = 1;
      return;
    }
    p.value = 0;
    p.value = withDelay(
      delayMs,
      withTiming(1, { duration: durationMs, easing }),
    );
    return () => cancelAnimation(p);
  }, [p, delayMs, durationMs, easing, isInstant]);
  return p;
}
