import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useClovieMood } from '../useClovieMood';
import { CompanionContent } from './CompanionContent';
import { CompanionSheet } from './CompanionSheet';
import { HeardBanner } from './HeardBanner';

/** Leaves the sheet; falls back to Today when opened from a deep link. */
const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** The companion sheet route: Nerova's owner chat over whatever screen opened it. */
export function CompanionScreen() {
  const { mood, onWidgetEvent } = useClovieMood();
  const { heard } = useLocalSearchParams<{ heard?: string }>();
  return (
    <CompanionSheet mood={mood} onClose={close}>
      {heard ? <HeardBanner text={heard} /> : null}
      <View style={{ flex: 1 }}>
        <CompanionContent onWidgetEvent={onWidgetEvent} />
      </View>
    </CompanionSheet>
  );
}
