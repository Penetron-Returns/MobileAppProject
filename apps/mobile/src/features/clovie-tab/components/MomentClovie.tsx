import type { MomentAvatarProperties } from '@nerova/react-native';
import { View } from 'react-native';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';
import { ClovieSprite } from '@/features/clovie-character/ClovieSprite';
import { useMotionActive } from '@/hooks/useMotionActive';

/** The hero (idle) slot is drawn larger than the SDK's box so he reads clearly. */
const HERO_SCALE = 1.4;
const HERO_MIN_SIZE = 64;

/**
 * Clovie inside Nerova's `<CompanionMoment>` (`renderAvatar`). Idle is the
 * pre-rendered sprite (a bitmap that blinks: no WebView, no per-frame cost);
 * the live WebView renderer is kept only for `working`, where the companion is
 * busy and he hops, and it mounts after the first content has settled. Both
 * pause (still image, no blinking) whenever the tab is not focused, the app is
 * backgrounded or Reduce Motion is on. Decorative; the SDK's avatar button
 * carries the label.
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
        {state === 'working' ? (
          <ClovieAnimated
            state="working"
            size={drawn}
            isPaused={!isActive}
            isDeferred
          />
        ) : (
          <ClovieSprite size={drawn} isActive={isActive} />
        )}
      </View>
    </View>
  );
}
