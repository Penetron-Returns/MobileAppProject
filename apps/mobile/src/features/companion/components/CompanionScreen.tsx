import { router } from 'expo-router';

import { useClovieMood } from '../useClovieMood';
import { CompanionContent } from './CompanionContent';
import { CompanionSheet } from './CompanionSheet';

/** Leaves the sheet; falls back to Today when opened from a deep link. */
const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** The companion sheet route: Nerova's owner chat over whatever screen opened it. */
export function CompanionScreen() {
  const { mood, onWidgetEvent } = useClovieMood();
  return (
    <CompanionSheet mood={mood} onClose={close}>
      <CompanionContent onWidgetEvent={onWidgetEvent} />
    </CompanionSheet>
  );
}
