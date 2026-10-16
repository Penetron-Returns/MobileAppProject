import { useAppColorScheme, useDepth } from '@booking/ui';
import {
  CompanionProvider,
  CompanionSheet,
  type CompanionSheetHandle,
  type CompanionTransport,
} from '@nerova/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';

import { useClovieMood } from '../useClovieMood';
import { buildCompanionAppearance } from './companionAppearance';
import { SdkClovie } from './SdkClovie';
import { useSdkSessionProvider } from './useSdkSessionProvider';

/** Where the hosted WhatsApp connect page returns to (`app.json` scheme `bookingadmin`). */
export const WHATSAPP_RETURN_URL = 'bookingadmin://companion/whatsapp-return';

/** Leaves the sheet; falls back to Today when opened from a deep link. */
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

type Activity = 'busy' | 'reply' | 'idle';

/**
 * The companion route when the SDK flag is on: Nerova's native sheet over the
 * screen that opened it. Everything SDK-specific lives in this folder, so
 * turning the flag off leaves the iframe path as it was.
 * `transport` replaces the HTTP transport (tests and demos only).
 */
export function CompanionSdkScreen({
  transport,
  onClose = leave,
}: {
  transport?: CompanionTransport;
  onClose?: () => void;
}) {
  const { isDark } = useAppColorScheme();
  const depth = useDepth();
  const appearance = React.useMemo(
    () => buildCompanionAppearance(depth, isDark),
    [depth, isDark],
  );
  const sessionProvider = useSdkSessionProvider(isDark ? 'dark' : 'light');
  const { mood, onWidgetEvent } = useClovieMood();
  const onActivity = React.useCallback(
    (activity: Activity) => onWidgetEvent({ kind: activity }),
    [onWidgetEvent],
  );

  // What the owner said to "Hey Clovie" goes into the composer, unsent.
  const { heard } = useLocalSearchParams<{ heard?: string }>();
  const sheetRef = React.useRef<CompanionSheetHandle>(null);
  React.useEffect(() => {
    if (heard) sheetRef.current?.setDraftText(heard);
  }, [heard]);

  return (
    <CompanionProvider
      sessionProvider={sessionProvider}
      whatsAppReturnUrl={WHATSAPP_RETURN_URL}
      appearance={appearance}
      onActivity={onActivity}
      transport={transport}
    >
      <CompanionSheet
        ref={sheetRef}
        defaultDetent="half"
        onClose={onClose}
        renderAvatar={({ size }) => <SdkClovie mood={mood} size={size} />}
      />
    </CompanionProvider>
  );
}
