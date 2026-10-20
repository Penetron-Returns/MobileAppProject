import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SCALE, springConfig } from '../../tokens/motion';

/**
 * A spring press bounce for the large round buttons: shrinks to
 * `SCALE.pressedLarge` on press-in and springs back on press-out. Spread
 * `handlers` on the pressable and `style` on an `Animated.View` around it.
 */
export function usePressBounce() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const handlers = {
    onPressIn: () => {
      scale.value = withSpring(SCALE.pressedLarge, springConfig('snappy'));
    },
    onPressOut: () => {
      scale.value = withSpring(1, springConfig('snappy'));
    },
  };
  return { style, handlers };
}
