import { useAppColorScheme } from '@booking/ui';
import type { MomentAvatarProperties } from '@nerova/react-native';
import { Image, View } from 'react-native';

import { ClovieSprite } from '@/features/clovie-character';

const LIGHT = require('@/assets/images/companion-default.png');
const DARK = require('@/assets/images/companion-default-dark.png');

/**
 * Our Clovie inside Nerova's `<CompanionMoment>` (`renderAvatar`): a still
 * image at rest, the blinking sprite only while the companion is working, so
 * nothing animates when idle. The SDK's `blinkToken` is not used: the sprite
 * runs its own blink schedule. Decorative; the screen carries the labels.
 */
export function MomentClovie({ state, size }: MomentAvatarProperties) {
  const { isDark } = useAppColorScheme();
  if (state === 'working') {
    return (
      <View
        testID="moment-clovie"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <ClovieSprite size={size} isActive />
      </View>
    );
  }
  return (
    <Image
      testID="moment-clovie"
      source={isDark ? DARK : LIGHT}
      accessibilityElementsHidden
      importantForAccessibility="no"
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
