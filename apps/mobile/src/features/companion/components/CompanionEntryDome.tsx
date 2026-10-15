import { CompanionDome, useAppColorScheme } from '@booking/ui';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useCompanionEntry } from '../useCompanionEntry';

/** The companion dome above the tab bar: shown only when the plan has the companion. */
export function CompanionEntryDome() {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  const { isVisible, attentionCount } = useCompanionEntry();
  if (!isVisible) return null;
  return (
    <CompanionDome
      character={
        isDark
          ? require('@/assets/images/companion-default-dark.png')
          : require('@/assets/images/companion-default.png')
      }
      count={attentionCount}
      label={
        attentionCount > 0
          ? t('companion.domeLabelCount', { count: attentionCount })
          : t('companion.domeLabel')
      }
      onPress={() => router.push('/companion' as never)}
    />
  );
}
