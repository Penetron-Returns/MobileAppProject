import * as React from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the OS asks for reduced motion. For animation that does not go
 * through Reanimated (CSS-style `animate-*` classes); Reanimated animations
 * use `ReduceMotion.System` instead.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => alive && setReduce(value))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      setReduce,
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
