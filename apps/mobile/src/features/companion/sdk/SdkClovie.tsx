import { SPRING, useReduceMotion } from '@booking/ui';
import type { CompanionSheetProps } from '@nerova/react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

const POP_SCALE = 1.18;

type AvatarArgs = Parameters<
  NonNullable<CompanionSheetProps['renderAvatar']>
>[0];

/** The SDK's activity state, as the mood names our a11y labels already use. */
const MOOD = {
  idle: 'idle',
  working: 'thinking',
  nod: 'replied',
  listening: 'idle',
} as const satisfies Record<AvatarArgs['state'], string>;

/**
 * The one Clovie of the SDK sheet, drawn by the SDK's `renderAvatar` (with
 * `avatar="hidden"` its own plush character is not rendered). Driven by the
 * activity `state` the SDK passes: works while the companion is busy, pops
 * once on the reply nod (no pop under reduced motion), otherwise idle. The SDK
 * positions it, so this has no absolute offsets.
 */
export function SdkClovie({ state, size }: Pick<AvatarArgs, 'state' | 'size'>) {
  const mood = MOOD[state];
  const { t } = useTranslation();
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
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(`companion.clovie.${mood}`)}
      style={[{ width: size, height: size, overflow: 'visible' }, popStyle]}
    >
      <ClovieAnimated
        state={state === 'working' ? 'working' : 'default'}
        size={size}
      />
    </Animated.View>
  );
}
