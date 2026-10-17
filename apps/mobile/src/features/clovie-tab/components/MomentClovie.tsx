import type { MomentAvatarProperties } from '@nerova/react-native';
import { View } from 'react-native';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';
import { useMotionActive } from '@/hooks/useMotionActive';

/** The hero (idle) slot is drawn larger than the SDK's box so he reads clearly. */
const HERO_SCALE = 1.4;
const HERO_MIN_SIZE = 64;

/**
 * The real animated Clovie (the same live renderer as the companion sheet and
 * the voice drawer) inside Nerova's `<CompanionMoment>` (`renderAvatar`): idle
 * looks around and blinks, `working` while the companion is busy. It is paused,
 * showing his still image with no WebView, whenever the tab is not focused,
 * the app is backgrounded or Reduce Motion is on. Decorative; the SDK's avatar
 * button carries the label.
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
        <ClovieAnimated
          state={state === 'working' ? 'working' : 'default'}
          size={drawn}
          isPaused={!isActive}
        />
      </View>
    </View>
  );
}
