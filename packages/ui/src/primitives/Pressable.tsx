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
 *
 * The pressed state is tracked here and one flat style object is handed to
 * the native Pressable. A style callback holding nested arrays of depth
 * tokens (gradient + box-shadow) lost its size and fill under NativeWind on
 * Android (switches, colour swatches and the Inbox dome collapsed).
 */
export function Pressable({
  feedback = 'dim',
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const depth = useDepth();
  const [pressed, setPressed] = React.useState(false);
  const flat = StyleSheet.flatten([
    typeof style === 'function' ? style({ pressed, hovered: false }) : style,
    feedback === 'dim' && pressed && { opacity: 0.6 },
    feedback === 'inset' && pressed && depth.buttonPressed,
    feedback === 'nudge' && pressed && NUDGE,
  ]);
  return (
    <RNPressable
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
