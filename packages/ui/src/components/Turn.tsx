import * as React from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DURATION, timingConfig } from '../tokens/motion';

export interface TurnProps {
  /** Turned (true) or at rest (false). */
  open: boolean;
  /** How far it turns when open: 180 for a "more" chevron, 90 for a row chevron. */
  degrees?: number;
  children: React.ReactNode;
}

/**
 * Turns its child between 0 and `degrees` with the quick timing token (instant
 * under reduced motion). Wrap the icon in this instead of putting a rotate
 * transform on the SVG icon itself, which drops the icon on Android.
 */
export function Turn({ open, degrees = 180, children }: TurnProps) {
  const turn = useSharedValue(open ? 1 : 0);
  React.useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, timingConfig(DURATION.quick));
  }, [open, turn]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * degrees}deg` }],
  }));
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      style={style}
    >
      {children}
    </Animated.View>
  );
}
