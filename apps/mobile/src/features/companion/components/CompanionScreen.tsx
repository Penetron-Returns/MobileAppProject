import { useAppColorScheme } from '@booking/ui';
import { router } from 'expo-router';

import { CompanionContent } from './CompanionContent';
import { CompanionSheet } from './CompanionSheet';

/** Leaves the sheet; falls back to Today when opened from a deep link. */
const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** The companion sheet route: Nerova's owner chat over whatever screen opened it. */
export function CompanionScreen() {
  const { isDark } = useAppColorScheme();
  return (
    <CompanionSheet
      character={
        isDark
          ? require('@/assets/images/companion-default-dark.png')
          : require('@/assets/images/companion-default.png')
      }
      onClose={close}
    >
      <CompanionContent />
    </CompanionSheet>
  );
}
