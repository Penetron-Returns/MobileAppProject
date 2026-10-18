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
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useDepth } from '../theme/useDepth';
import { DURATION, SCALE } from '../tokens/motion';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/** Opacity of a dimmed (pressed) row or link. */
const DIM_OPACITY = 0.6;

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
 * The shrink and 1pt drop are driven by a shared value that eases on the UI
 * thread, so `nudge` and `none` never re-render this component on press. `dim`,
 * `inset` (which swaps in the pressed depth surface) and a caller's `style`
 * callback need the pressed flag and track it in React state. One flat style object
 * goes to the native Pressable: a style callback holding nested arrays of depth
 * tokens (gradient + box-shadow) lost its size and fill under NativeWind on
 * Android (switches, colour swatches and the Inbox dome collapsed).
 */
function PressableImpl({
  feedback = 'dim',
  pressedScale = SCALE.pressed,
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const depth = useDepth();
  const progress = useSharedValue(0);
  // Opacity can't be animated here without overriding an `opacity-*` class on the
  // same view (disabled rows), so `dim` flips a flag; only shrinks run on the UI thread.
  const needsState =
    feedback === 'dim' || feedback === 'inset' || typeof style === 'function';
  const [pressed, setPressed] = React.useState(false);
  const scales = feedback === 'nudge' || feedback === 'inset';
  const nudge = feedback === 'nudge' ? 1 : 0;

  const animatedStyle = useAnimatedStyle(() => {
    if (!scales) return {};
    return {
      transform: [
        { translateY: nudge * progress.value },
        { scale: 1 - progress.value * (1 - pressedScale) },
      ],
    };
  }, [scales, nudge, pressedScale]);

  const handlePressIn = React.useCallback(
    (event: GestureResponderEvent) => {
      progress.value = withTiming(1, {
        duration: DURATION.press,
        reduceMotion: ReduceMotion.System,
      });
      if (needsState) setPressed(true);
      onPressIn?.(event);
    },
    [progress, needsState, onPressIn],
  );
  const handlePressOut = React.useCallback(
    (event: GestureResponderEvent) => {
      progress.value = withTiming(0, {
        duration: DURATION.press,
        reduceMotion: ReduceMotion.System,
      });
      if (needsState) setPressed(false);
      onPressOut?.(event);
    },
    [progress, needsState, onPressOut],
  );

  const flat = StyleSheet.flatten([
    typeof style === 'function'
      ? style({ pressed } as PressableStateCallbackType)
      : style,
    feedback === 'dim' && pressed && { opacity: DIM_OPACITY },
    feedback === 'inset' && pressed && depth.buttonPressed,
  ]);
  return (
    <AnimatedPressable
      style={[flat, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    />
  );
}

export const Pressable = React.memo(PressableImpl);
