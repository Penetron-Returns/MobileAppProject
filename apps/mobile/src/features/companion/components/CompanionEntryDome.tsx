import { CompanionDome, TIMING, useAppColorScheme } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const LIGHT = require('@/assets/images/companion-default.png');
const DARK = require('@/assets/images/companion-default-dark.png');

import { useCompanionSheet } from '../sdk/companionSheetControl';
import { useCompanionEntry } from '../useCompanionEntry';

/** How small the dome shrinks while it fades out. */
const HIDDEN_SCALE = 0.7;

/**
/**
 * The companion bubble at the bottom right, above the tab bar: shown only when
 * the plan has the companion. Clovie is the still image (nothing animates at
 * rest) with the attention badge. `isHidden` (the Clovie tab of the AI plans,
 * where the tab's own chat area is the entry) fades and shrinks it out and
 * stops it taking touches or screen reader focus.
 */
export function CompanionEntryDome({
  isHidden = false,
}: {
  isHidden?: boolean;
}) {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  const { isVisible, attentionCount } = useCompanionEntry();
  const sheet = useCompanionSheet();
  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(isHidden ? 0 : 1, TIMING.quick),
    transform: [
      {
        scale: withTiming(isHidden ? HIDDEN_SCALE : 1, TIMING.quick),
      },
    ],
  }));
  if (!isVisible) return null;
  return (
    <Animated.View
      testID="companion-dome-fade"
      pointerEvents={isHidden ? 'none' : 'auto'}
      accessibilityElementsHidden={isHidden}
      importantForAccessibility={isHidden ? 'no-hide-descendants' : 'auto'}
      style={fade}
    >
      <CompanionDome
        character={isDark ? DARK : LIGHT}
        count={attentionCount}
        label={
          attentionCount > 0
            ? t('companion.domeLabelCount', { count: attentionCount })
            : t('companion.domeLabel')
        }
        onPress={() =>
          sheet.isAvailable ? sheet.open() : router.push('/companion' as never)
        }
      />
    </Animated.View>
  );
}
