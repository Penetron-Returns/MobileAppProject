import type { MomentAvatarProperties } from '@nerova/react-native';
import { View } from 'react-native';

import {
  ClovieCharacter,
  type ClovieEmotion,
} from '@/features/clovie-character';
import { useMotionActive } from '@/hooks/useMotionActive';

/** The hero (idle) slot is drawn larger than the SDK's box so he reads clearly. */
const HERO_SCALE = 1.4;
const HERO_MIN_SIZE = 64;

/** What Clovie feels for each avatar state the SDK reports. */
const EMOTION: Record<MomentAvatarProperties['state'], ClovieEmotion> = {
  idle: 'calm',
  working: 'thoughtful',
  nod: 'delighted',
};

/**
 * The real Clovie inside Nerova's `<CompanionMoment>` (`renderAvatar`): the
 * live character with idle motion, blinking and an emotion per state. It runs
 * only while the Clovie tab is focused, the app is in the foreground and
 * Reduce Motion is off (`useMotionActive`); otherwise the character shows his
 * still image and costs nothing. Decorative; the screen carries the labels.
 */
export function MomentClovie({ state, size }: MomentAvatarProperties) {
  const isActive = useMotionActive();
  const drawn = size >= HERO_MIN_SIZE ? Math.round(size * HERO_SCALE) : size;
  // Grown to the right and evenly up and down, so his left edge stays on the text's.
  const offset = (size - drawn) / 2;
  return (
    <View
      testID="moment-clovie"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size, overflow: 'visible' }}
    >
      <View style={{ marginTop: offset }}>
        <ClovieCharacter
          emotion={EMOTION[state]}
          size={drawn}
          isActive={isActive}
          isLive={isActive}
        />
      </View>
    </View>
  );
}
