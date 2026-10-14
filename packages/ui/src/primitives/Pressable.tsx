import * as React from 'react';
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useDepth } from '../theme/useDepth';

const NUDGE = { transform: [{ translateY: 1 }] } as const;

export interface PressableProps extends Omit<RNPressableProps, 'style'> {
  /**
   * What happens visually while pressed: `dim` fades (text links, rows),
   * `inset` presses the surface in (depth `buttonPressed`), `nudge` is the
   * tactile 1pt drop of the primary button.
   */
  feedback?: 'dim' | 'inset' | 'nudge' | 'none';
  style?:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
}

/**
 * `Pressable` with the design's pressed states built in, so every tappable
 * thing in the app responds the same way. Callers still set the
 * accessibility role and label.
 */
export function Pressable({
  feedback = 'dim',
  style,
  ...props
}: PressableProps) {
  const depth = useDepth();
  return (
    <RNPressable
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        feedback === 'dim' && state.pressed && { opacity: 0.6 },
        feedback === 'inset' && state.pressed && depth.buttonPressed,
        feedback === 'nudge' && state.pressed && NUDGE,
      ]}
      {...props}
    />
  );
}
