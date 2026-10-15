import * as React from 'react';
import {
  Pressable as RNPressable,
  StyleSheet,
  type GestureResponderEvent,
  type PressableProps as RNPressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { useDepth } from '../theme/useDepth';
import { useReduceMotion } from '../theme/useReduceMotion';
import { DURATION, SCALE } from '../tokens/motion';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/** The pressed pose: one point down and a touch smaller. Fixed op order so it interpolates. */
const REST = { transform: [{ translateY: 0 }, { scale: 1 }] } as const;

/**
 * Reanimated CSS transition: the transform eases over the press token on the
 * UI thread. Dropped under reduced motion, where the pose changes instantly.
 */
const TRANSITION = {
  transitionProperty: 'transform',
  transitionDuration: DURATION.press,
  transitionTimingFunction: 'ease',
} as const;

export interface PressableProps extends Omit<RNPressableProps, 'style'> {
  /**
   * What happens visually while pressed: `dim` fades (text links, rows),
   * `inset` presses the surface in (depth `buttonPressed`) with a slight
   * shrink, `nudge` is the tactile 1pt drop and shrink of the primary button.
   */
  feedback?: 'dim' | 'inset' | 'nudge' | 'none';
  /** Scale while pressed for `inset` and `nudge`; 1 turns the shrink off. */
  pressedScale?: number;
  style?:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
}

/**
 * `Pressable` with the design's pressed states built in, so every tappable
 * thing in the app responds the same way. Callers still set the
 * accessibility role and label.
 *
 * The pressed state is tracked here and one flat style object is handed to
 * the native Pressable. A style callback holding nested arrays of depth
 * tokens (gradient + box-shadow) lost its size and fill under NativeWind on
 * Android (switches, colour swatches and the Inbox dome collapsed). The scale
 * is part of that flat object (a CSS transition, no shared values), so the
 * shape of the style never changes.
 */
export function Pressable({
  feedback = 'dim',
  pressedScale = SCALE.pressed,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const [pressed, setPressed] = React.useState(false);
  const scales = feedback === 'nudge' || feedback === 'inset';
  const pose = {
    transform: [
      { translateY: feedback === 'nudge' ? 1 : 0 },
      { scale: pressedScale },
    ],
  };
  const flat = StyleSheet.flatten([
    typeof style === 'function'
      ? style({ pressed } as PressableStateCallbackType)
      : style,
    feedback === 'dim' && pressed && { opacity: 0.6 },
    feedback === 'inset' && pressed && depth.buttonPressed,
    scales && (pressed ? pose : REST),
    scales && !reduceMotion && TRANSITION,
  ]);
  return (
    <AnimatedPressable
      style={flat}
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      {...props}
    />
  );
}
