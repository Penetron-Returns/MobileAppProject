import { Text, useReduceMotion } from '@booking/ui';
import Animated, { FadeIn } from 'react-native-reanimated';

/**
 * The date line and the large greeting. The greeting is the screen's heading.
 * It fades in once on mount (the only motion here) and not at all with
 * Reduce Motion.
 */
export function ClovieHeader({
  caption,
  greeting,
}: {
  caption: string;
  greeting: string;
}) {
  const isReduced = useReduceMotion();
  return (
    <Animated.View
      entering={isReduced ? undefined : FadeIn.duration(400)}
      className="px-5 pt-1"
    >
      <Text className="text-title font-semibold text-muted-foreground">
        {caption}
      </Text>
      <Text
        role="heading"
        aria-level="1"
        style={{ letterSpacing: 0.4 }}
        className="text-large-title font-bold"
      >
        {greeting}
      </Text>
    </Animated.View>
  );
}
