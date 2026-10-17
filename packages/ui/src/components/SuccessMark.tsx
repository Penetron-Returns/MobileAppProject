import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '../lib/haptics';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { springConfig } from '../tokens/motion';

/** The large green completion dome (design: 88pt on the done screen). */
export function SuccessMark({ size = 88 }: { size?: number }) {
  const depth = useDepth();
  // The dome pops in with a bouncy overshoot; reduced motion lands it at once.
  const pop = useSharedValue(0);
  React.useEffect(() => {
    pop.value = withSpring(1, springConfig('bouncy'));
    haptics.success();
  }, [pop]);
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2),
    transform: [{ scale: 0.6 + 0.4 * pop.value }],
  }));
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        depth.dome,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: depth.colors.success,
          alignItems: 'center',
          justifyContent: 'center',
        },
        popStyle,
      ]}
    >
      <Check size={size * 0.59} strokeWidth={2.6} color={depth.colors.onFill} />
    </Animated.View>
  );
}

/** A green check followed by a line of text (feature or status list item). */
export function CheckPoint({ text }: { text: string }) {
  const depth = useDepth();
  return (
    <View className="flex-row items-start gap-2.5">
      <Check size={20} strokeWidth={2.6} color={depth.colors.green} />
      <Text className="text-subtitle flex-1">{text}</Text>
    </View>
  );
}
