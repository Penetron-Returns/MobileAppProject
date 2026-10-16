import { SPRING, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

import type { ClovieMood } from '../logic';

const POP_SCALE = 1.18;

/**
 * The one Clovie of the SDK sheet, drawn by the SDK's `renderAvatar` (its own
 * plush character is not rendered then). Same behaviour as the iframe path's
 * `CompanionEdgeClovie`: works while the companion is busy, pops once when a
 * reply lands (no pop under reduced motion), otherwise idle. The SDK
 * positions it, so this has no absolute offsets.
 */
export function SdkClovie({ mood, size }: { mood: ClovieMood; size: number }) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  React.useEffect(() => {
    if (mood !== 'replied' || reduceMotion) return;
    scale.value = withSequence(
      withSpring(POP_SCALE, SPRING.bouncy),
      withSpring(1, SPRING.bouncy),
    );
  }, [mood, reduceMotion, scale]);

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      testID="companion-clovie"
      pointerEvents="none"
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(`companion.clovie.${mood}`)}
      style={[{ width: size, height: size, overflow: 'visible' }, popStyle]}
    >
      <ClovieAnimated
        state={mood === 'thinking' ? 'working' : 'default'}
        size={size}
      />
    </Animated.View>
  );
}
