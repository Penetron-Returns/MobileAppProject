import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  withDelay,
  withTiming,
  type LayoutAnimationFunction,
} from 'react-native-reanimated';

import { GENTLE, RISE_MS, RISE_PT, riseDelay } from '../motion';

/** Entering animation: rises a few pt and fades in, `delay` after the first. Instant under Reduce Motion. */
function riseIn(delay: number) {
  return () => {
    'worklet';
    const config = {
      duration: RISE_MS,
      easing: GENTLE,
      reduceMotion: ReduceMotion.System,
    };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: RISE_PT }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, config)),
        transform: [{ translateY: withDelay(delay, withTiming(0, config)) }],
      },
    };
  };
}

/**
 * One staged line of a screen: a subtle rise 40ms after the one before, and
 * nothing waits past the fourth. It is only visual: taps work from the first frame.
 */
export function Rise({
  index = 0,
  style,
  layout,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  /** Animates this line's position when what is above it changes size. */
  layout?: LayoutAnimationFunction | object;
  children: React.ReactNode;
}) {
  const entering = React.useMemo(() => riseIn(riseDelay(index)), [index]);
  return (
    <Animated.View
      entering={entering}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layout={layout as any}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
