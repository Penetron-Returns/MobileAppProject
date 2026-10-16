import { SPRING, useReduceMotion } from '@booking/ui';
import type { RenderAvatarState } from '@nerova/react-native';
import * as React from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

const POP_SCALE = 1.18;

/**
 * The one Clovie of the SDK sheet, drawn by the SDK's `renderAvatar` (with
 * `avatar="hidden"` its own plush character is not rendered). Driven by the
 * activity `state` the SDK passes: works while the companion is busy, pops
 * once on the reply nod (no pop under reduced motion), otherwise idle. The SDK
 * positions it, so this has no absolute offsets. It is decorative: the SDK's
 * avatar button announces "{name}, {state}" from `companion.sdk.avatarButton`
 * and `avatarState*`, the single source of the label.
 */
export function SdkClovie({
  state,
  size,
}: {
  state: RenderAvatarState;
  size: number;
}) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (state !== 'nod' || reduceMotion) return;
    scale.value = withSequence(
      withSpring(POP_SCALE, SPRING.bouncy),
      withSpring(1, SPRING.bouncy),
    );
  }, [state, reduceMotion, scale]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      testID="companion-clovie"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, overflow: 'visible' }, popStyle]}
    >
      <ClovieAnimated
        state={state === 'working' ? 'working' : 'default'}
        size={size}
      />
    </Animated.View>
  );
}
