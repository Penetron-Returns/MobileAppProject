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

/** Companion.dc.html: a 64pt character, 16pt in from the left. */
export const EDGE_CLOVIE_SIZE = 64;
export const EDGE_CLOVIE_LEFT = 16;
/** Companion.dc.html: the character's bottom edge sits 4pt above the sheet's top edge. */
export const EDGE_CLOVIE_GAP = 4;
const POP_SCALE = 1.18;

/**
 * Clovie perched on the sheet's top-left edge, outside it. Works while the
 * companion is thinking and pops once when a reply lands (no pop under reduced
 * motion; the state still swaps). Must be rendered inside a non-clipping parent.
 */
export function CompanionEdgeClovie({ mood }: { mood: ClovieMood }) {
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
      style={[
        {
          position: 'absolute',
          left: EDGE_CLOVIE_LEFT,
          top: -(EDGE_CLOVIE_SIZE + EDGE_CLOVIE_GAP),
          width: EDGE_CLOVIE_SIZE,
          height: EDGE_CLOVIE_SIZE,
          overflow: 'visible',
        },
        popStyle,
      ]}
    >
      <ClovieAnimated
        state={mood === 'thinking' ? 'working' : 'default'}
        size={EDGE_CLOVIE_SIZE}
      />
    </Animated.View>
  );
}
