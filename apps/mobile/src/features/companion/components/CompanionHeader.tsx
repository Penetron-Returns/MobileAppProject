import { SPRING, Text, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

import type { ClovieMood } from '../logic';

const CLOVIE_SIZE = 40;
const POP_SCALE = 1.18;

/**
 * The sheet's header: Clovie beside the title. Clovie works while the
 * companion is thinking and pops once when a reply lands (no pop under
 * reduced motion; the state still swaps).
 */
export function CompanionHeader({ mood }: { mood: ClovieMood }) {
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
    <View className="flex-row items-center gap-3 px-5 pb-2">
      <Animated.View
        testID="companion-clovie"
        accessible
        accessibilityRole="image"
        accessibilityLabel={t(`companion.clovie.${mood}`)}
        style={popStyle}
      >
        <ClovieAnimated
          state={mood === 'thinking' ? 'working' : 'default'}
          size={CLOVIE_SIZE}
        />
      </Animated.View>
      <Text role="heading" aria-level="1" className="text-section font-bold">
        {t('companion.title')}
      </Text>
    </View>
  );
}
