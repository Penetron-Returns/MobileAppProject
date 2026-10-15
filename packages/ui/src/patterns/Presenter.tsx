import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DURATION, EASING, timingConfig } from '../tokens/motion';

/** The scene behind a presented sheet (board: a black root under the scaled screen). */
const BACKDROP = '#000000';
const SCALE = 0.94;
const RADIUS = 40;

/**
 * Wraps a screen that presents a `FormSheet`: while `active`, the screen
 * shrinks to 94% with rounded corners over a black backdrop, as iOS card
 * presentation does. Honours reduced motion.
 */
export function Presenter({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  React.useEffect(() => {
    progress.value = withTiming(
      active ? 1 : 0,
      timingConfig(DURATION.page, EASING.inOut),
    );
  }, [active, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - SCALE) * progress.value }],
    borderRadius: RADIUS * progress.value,
  }));
  return (
    <View style={{ flex: 1, backgroundColor: BACKDROP }}>
      <Animated.View
        style={[
          { flex: 1, overflow: 'hidden', transformOrigin: '50% 0%' },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
