import * as React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useClovieMood } from '../useClovieMood';
import { CompanionContent } from './CompanionContent';
import { CompanionSheet } from './CompanionSheet';
import { ConnectWhatsAppCard } from './ConnectWhatsAppCard';
import { HeardBanner } from './HeardBanner';

/** Leaves the sheet; falls back to Today when opened from a deep link. */
const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** The companion sheet route: Nerova's owner chat over whatever screen opened it. */
export function CompanionScreen() {
  const { mood, onWidgetEvent } = useClovieMood();
  // Bumped when WhatsApp gets connected: the chat remounts and mints a fresh session.
  const [chatKey, setChatKey] = React.useState(0);
  const { heard } = useLocalSearchParams<{ heard?: string }>();
  return (
    <CompanionSheet mood={mood} onClose={close}>
      {heard ? <HeardBanner text={heard} /> : null}
      <ConnectWhatsAppCard onConnected={() => setChatKey((k) => k + 1)} />
      <View style={{ flex: 1 }}>
        <CompanionContent key={chatKey} onWidgetEvent={onWidgetEvent} />
      </View>
    </CompanionSheet>
  );
}
