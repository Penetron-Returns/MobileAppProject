import { COMPANION_DOME_CHARACTER_SIZE, CompanionDome } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

import { useCompanionSheet } from '../sdk/companionSheetControl';
import { useCompanionEntry } from '../useCompanionEntry';

/**
 * The companion dome above the tab bar: shown only when the plan has the
 * companion. Clovie idles inside it; the hop spills above the dome, so neither
 * this wrapper nor the dome clips.
 */
export function CompanionEntryDome() {
  const { t } = useTranslation();
  const { isVisible, attentionCount } = useCompanionEntry();
  const sheet = useCompanionSheet();
  if (!isVisible) return null;
  return (
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
  );
}
