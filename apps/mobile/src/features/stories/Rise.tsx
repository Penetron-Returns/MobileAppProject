import { useReduceMotion } from '@booking/ui';
import * as React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle } from 'react-native-reanimated';

import { EASE_SPRING } from './motion';
import { useReveal } from './useReveal';

const FADE = Easing.linear;

interface RiseProps {
  /** Position in the stagger: each line is 70 ms after the last. */
  index?: number;
  /** Extra start delay in ms. */
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * A line that rises 12 pt and fades in, staggered by `index`. Reduce Motion:
 * a plain 200 ms fade with no travel.
 */
export function Rise({ index = 0, delayMs = 0, style, children }: RiseProps) {
  const isReduced = useReduceMotion();
  const p = useReveal(
    isReduced ? 0 : index * 70 + 90 + delayMs,
    isReduced ? 200 : 420,
    isReduced ? FADE : EASE_SPRING,
  );
  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: isReduced ? 0 : 12 * (1 - p.value) }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
