import { useAppColorScheme, useDepth } from '@booking/ui';
import {
  CompanionProvider,
  CompanionSheet,
  type AppointmentContext,
  type CompanionSheetHandle,
  type CompanionTransport,
  useCompanion,
} from '@nerova/react-native';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { useEntitlements } from '@/features/plans/hooks';
import { companionSdkEnabled, nerovaApi } from '@/lib/env';

import { buildCompanionAppearance } from './companionAppearance';
import {
  CompanionSheetControlProvider,
  type CompanionSheetControl,
  type OpenCompanionOptions,
} from './companionSheetControl';
import { SdkClovie } from './SdkClovie';
import { useSdkLabels } from './useSdkLabels';
import { useSdkSessionProvider } from './useSdkSessionProvider';

/** Where the hosted WhatsApp connect page returns to (`app.json` scheme `bookingadmin`). */
export const WHATSAPP_RETURN_URL = 'bookingadmin://companion/whatsapp-return';

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
 * thread loaded before the owner ever taps Clovie. The sheet starts at `rest`
 * (no dim, no avatar), so it is invisible until `open()`.
 */
const PersistentSheet = React.forwardRef<
  SheetHandle,
  {
    transport?: CompanionTransport;
    onFailedChange: (isFailed: boolean) => void;
  }
>(function PersistentSheet({ transport, onFailedChange }, ref) {
  const { isDark } = useAppColorScheme();
  const depth = useDepth();
  const appearance = React.useMemo(
    () => buildCompanionAppearance(depth, isDark),
    [depth, isDark],
  );
  const sessionProvider = useSdkSessionProvider(isDark ? 'dark' : 'light');
  const labels = useSdkLabels();
  const sheetRef = React.useRef<CompanionSheetHandle>(null);
  const [context, setContext] = React.useState<AppointmentContext | null>(null);

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
      <CompanionSheet
        ref={sheetRef}
        defaultDetent="rest"
        restAvatar="hidden"
        context={context}
        onContextChange={setContext}
        renderAvatar={({ state, size, placement }) =>
          placement === 'rest' ? null : <SdkClovie state={state} size={size} />
        }
      />
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
  const control = React.useMemo<CompanionSheetControl>(
    () => ({
      isAvailable: isEntitled && !hasFailed,
      hasFailed: isEntitled && hasFailed,
      open: (options) => sheetRef.current?.open(options),
      close: () => sheetRef.current?.close(),
    }),
    [isEntitled, hasFailed],
  );
  return (
    <CompanionSheetControlProvider value={control}>
      {children}
      {isEntitled ? (
        <View
          testID="companion-sdk-layer"
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <PersistentSheet
            ref={sheetRef}
            transport={transport}
            onFailedChange={setHasFailed}
          />
        </View>
      ) : null}
    </CompanionSheetControlProvider>
  );
}

/**
 * Wraps the signed-in app. With `EXPO_PUBLIC_COMPANION_SDK=1` and a plan that
 * has the companion it keeps Nerova's native sheet mounted over everything;
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
