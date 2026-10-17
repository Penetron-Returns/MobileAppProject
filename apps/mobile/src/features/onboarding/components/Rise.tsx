import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const RISE_PT = 14;
const RISE_MS = 550;
const STAGGER_MS = 70;
/** The boards' gentle curve. */
const GENTLE = Easing.bezier(0.22, 1, 0.36, 1);

/** Entering animation: rises 14pt and fades over 550ms, `delay` after the first. Instant under Reduce Motion. */
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

/** One staged line of a screen: the boards' staggered rise (70ms apart). */
export function Rise({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const entering = React.useMemo(() => riseIn(index * STAGGER_MS), [index]);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
