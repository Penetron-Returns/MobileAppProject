import { useAppColorScheme, useDepth } from '@booking/ui';
import {
  CompanionProvider,
  CompanionSheet,
  type ChatContext,
  type CompanionSheetHandle,
  type CompanionTransport,
  useCompanion,
} from '@nerova/react-native';
import Constants from 'expo-constants';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEntitlements } from '@/features/plans/hooks';
import { InAppVoiceLayer } from '@/features/voice/inApp/InAppVoiceLayer';
import { companionSdkEnabled, nerovaApi } from '@/lib/env';

import { buildCompanionAppearance } from './companionAppearance';
import { CompanionLiveBridge } from './CompanionLiveBridge';
import { CompanionLiveProvider, type CompanionLive } from './companionLive';
import {
  CompanionSheetControlProvider,
  type CompanionSheetControl,
  type OpenCompanionOptions,
} from './companionSheetControl';
import { SdkClovie } from './SdkClovie';
import { useSdkLabels } from './useSdkLabels';
import { useSdkSessionProvider } from './useSdkSessionProvider';

/** The build variant's deep-link scheme (`app.config.ts`): `bookingadmin` in development, `clovie` in production. */
const APP_SCHEME = [Constants.expoConfig?.scheme].flat()[0] ?? 'bookingadmin';

/** Where the hosted WhatsApp connect page returns to. The API only forwards it for an allowlisted scheme. */
export const WHATSAPP_RETURN_URL = `${APP_SCHEME}://companion/whatsapp-return`;

interface SheetHandle {
  open: (options?: OpenCompanionOptions) => void;
  close: () => void;
}

/** Reports whether the SDK can serve the sheet (`unavailable`: account not ready, outage). */
function StatusBridge({ onChange }: { onChange: (isFailed: boolean) => void }) {
  const { status } = useCompanion();
  const isFailed = status === 'unavailable';
  React.useEffect(() => onChange(isFailed), [isFailed, onChange]);
  return null;
}

/**
 * Mounted once for the whole signed-in shell so the session is minted and the
 * thread loaded before the owner ever taps Clovie. It is also the app's one
 * `CompanionProvider`: it wraps the screens, so an inline `<CompanionMoment>`
 * (the Clovie tab) shares this session, thread and store with the sheet. The
 * sheet starts at `rest` (no dim, no avatar), so it is invisible until `open()`.
 */
const SdkShell = React.forwardRef<
  SheetHandle,
  {
    transport?: CompanionTransport;
    onFailedChange: (isFailed: boolean) => void;
    onLiveChange: (live: CompanionLive) => void;
    children: React.ReactNode;
  }
>(function SdkShell(
  { transport, onFailedChange, onLiveChange, children },
  ref,
) {
  const { isDark } = useAppColorScheme();
  const depth = useDepth();
  const appearance = React.useMemo(
    () => buildCompanionAppearance(depth, isDark),
    [depth, isDark],
  );
  const sessionProvider = useSdkSessionProvider(isDark ? 'dark' : 'light');
  const labels = useSdkLabels();
  // The SDK rides the keyboard itself and needs the nav-bar inset to rest on.
  const { top, bottom } = useSafeAreaInsets();
  const insets = React.useMemo(() => ({ top, bottom }), [top, bottom]);
  const sheetRef = React.useRef<CompanionSheetHandle>(null);
  const [context, setContext] = React.useState<ChatContext | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      open: (options) => {
        if (options?.context) setContext(options.context);
        if (options?.draft) sheetRef.current?.setDraftText(options.draft);
        sheetRef.current?.open('half');
      },
      close: () => sheetRef.current?.close(),
    }),
    [],
  );

  return (
    <CompanionProvider
      sessionProvider={sessionProvider}
      api={nerovaApi}
      whatsAppReturnUrl={WHATSAPP_RETURN_URL}
      appearance={appearance}
      labels={labels}
      transport={transport}
    >
      <StatusBridge onChange={onFailedChange} />
      <CompanionLiveBridge onChange={onLiveChange} />
      {children}
      <View
        testID="companion-sdk-layer"
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
      >
        <CompanionSheet
          ref={sheetRef}
          defaultDetent="rest"
          restAvatar="hidden"
          insets={insets}
          context={context}
          onContextChange={setContext}
          renderAvatar={({ state, size, placement }) =>
            placement === 'rest' ? null : (
              <SdkClovie state={state} size={size} />
            )
          }
        />
        <InAppVoiceLayer />
      </View>
    </CompanionProvider>
  );
});

function EnabledHost({
  children,
  transport,
}: {
  children: React.ReactNode;
  transport?: CompanionTransport;
}) {
  const isEntitled = useEntitlements().has('companion');
  const sheetRef = React.useRef<SheetHandle>(null);
  const [hasFailed, setHasFailed] = React.useState(false);
  const [live, setLive] = React.useState<CompanionLive | null>(null);
  const control = React.useMemo<CompanionSheetControl>(
    () => ({
      isAvailable: isEntitled && !hasFailed,
      hasFailed: isEntitled && hasFailed,
      open: (options) => sheetRef.current?.open(options),
      close: () => sheetRef.current?.close(),
      // The sheet shows Nerova's setup itself while setup is needed.
      openSetup: () => sheetRef.current?.open(),
    }),
    [isEntitled, hasFailed],
  );
  return (
    <CompanionSheetControlProvider value={control}>
      <CompanionLiveProvider value={isEntitled ? live : null}>
        {isEntitled ? (
          <SdkShell
            ref={sheetRef}
            transport={transport}
            onFailedChange={setHasFailed}
            onLiveChange={setLive}
          >
            {children}
          </SdkShell>
        ) : (
          children
        )}
      </CompanionLiveProvider>
    </CompanionSheetControlProvider>
  );
}

/**
 * Wraps the signed-in app. With `EXPO_PUBLIC_COMPANION_SDK=1` and a plan that
 * has the companion it provides the one SDK session to the whole app and keeps
 * Nerova's native sheet mounted over everything;
 * otherwise it renders the children untouched (the iframe path).
 * `transport` replaces the HTTP transport (tests and demos only).
 */
export function CompanionSdkHost({
  children,
  transport,
}: {
  children: React.ReactNode;
  transport?: CompanionTransport;
}) {
  if (!companionSdkEnabled) return <>{children}</>;
  return <EnabledHost transport={transport}>{children}</EnabledHost>;
}
