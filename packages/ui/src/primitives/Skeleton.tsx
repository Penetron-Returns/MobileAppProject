import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  makeMutable,
  ReduceMotion,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '../lib/cn';
import { useReduceMotion } from '../theme/useReduceMotion';

/**
 * One shared pulse for every skeleton on screen: a single UI-thread timeline,
 * started by the first mounted skeleton and stopped with the last, instead of
 * one CSS animation per block.
 */
const pulse = makeMutable(1);
let mounted = 0;

function startPulse() {
  mounted += 1;
  if (mounted > 1) return;
  pulse.value = withRepeat(
    withSequence(
      withTiming(0.55, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
    ),
    -1,
    false,
    undefined,
    ReduceMotion.System,
  );
}

function stopPulse() {
  mounted = Math.max(0, mounted - 1);
  if (mounted > 0) return;
  cancelAnimation(pulse);
  pulse.value = 1;
}

function Skeleton({
  className,
  style,
  ...props
}: React.ComponentProps<typeof View> & React.RefAttributes<View>) {
  const reduceMotion = useReduceMotion();
  React.useEffect(() => {
    if (reduceMotion) return;
    startPulse();
    return stopPulse;
  }, [reduceMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      className={cn('bg-accent rounded-md', className)}
      {...props}
      style={reduceMotion ? style : [animatedStyle, style]}
    />
  );
}

export { Skeleton };
