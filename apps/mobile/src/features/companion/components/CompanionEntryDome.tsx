import {
  COMPANION_DOME_CHARACTER_SIZE,
  CompanionDome,
  TIMING,
} from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

import { useCompanionSheet } from '../sdk/companionSheetControl';
import { useCompanionEntry } from '../useCompanionEntry';

/** How small the dome shrinks while it fades out. */
const HIDDEN_SCALE = 0.7;

/**
 * The companion dome above the tab bar: shown only when the plan has the
 * companion. Clovie idles inside it; the hop spills above the dome, so neither
 * this wrapper nor the dome clips. `isHidden` (the Today tab of the AI plans,
 * where the home's own Clovie is the entry) fades and shrinks it out, stops
 * it taking touches or screen reader focus, and parks its live canvas so only
 * one Clovie animates. The badge logic is untouched.
 */
export function CompanionEntryDome({
  isHidden = false,
}: {
  isHidden?: boolean;
}) {
  const { t } = useTranslation();
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
        characterSlot={
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ overflow: 'visible' }}
          >
            <ClovieAnimated
              state="default"
              size={COMPANION_DOME_CHARACTER_SIZE}
              isPaused={isHidden}
            />
          </View>
        }
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
