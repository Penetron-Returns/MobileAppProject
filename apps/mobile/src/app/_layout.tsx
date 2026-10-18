import '../../global.css';
import '@/lib/i18n';
import { Toaster } from '@booking/ui';
import { ClerkProvider } from '@clerk/expo';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PortalHost } from '@rn-primitives/portal';
import { Slot } from 'expo-router';
import * as React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokenCache } from '@/lib/clerk-token-cache';
import { AuthTokenBridge } from '@/components/AuthTokenBridge';
import { SessionCacheGuard } from '@/components/SessionCacheGuard';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { holdNativeSplash, hideNativeSplash } from '@/features/brand/splash';
import { ThemeProvider } from '@/components/ThemeProvider';
import { initAnalytics } from '@/features/analytics';
import { analyticsConfig, env, validateEnv } from '@/lib/env';
import { registerDeviceTokenSource } from '@/features/voice/deviceToken';
import { registerVoiceHeadlessTask } from '@/features/voice/headlessRegistration';
import { startFocusSync, startOnlineSync } from '@/lib/online';
import { whenIdle } from '@/lib/whenIdle';
import { queryClient } from '@/lib/query';
import {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  persister,
  shouldPersistQuery,
} from '@/lib/queryPersist';

const persistOptions = {
  persister,
  maxAge: PERSIST_MAX_AGE_MS,
  buster: PERSIST_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};

const SPLASH_SAFETY_MS = 5000;
const envState = validateEnv();
startOnlineSync();
startFocusSync();
// Hey Clovie (Android): lets the voice service run a command with the app in the background.
// Only the registration runs here; the task's code loads when a command arrives.
registerDeviceTokenSource();
registerVoiceHeadlessTask();
// Keep the native splash until a screen has drawn: the loading screen hides it on
// its first layout, other first screens through useHideSplashWhen.
holdNativeSplash();

export default function RootLayout() {
  // Analytics is not needed for the first frame: set it up once the thread is idle.
  React.useEffect(() => whenIdle(() => initAnalytics(analyticsConfig)), []);
  React.useEffect(() => {
    // Safety net: never leave the splash up if no screen reports a first frame.
    const id = setTimeout(hideNativeSplash, SPLASH_SAFETY_MS);
    return () => clearTimeout(id);
  }, []);
  if (!envState.ok) {
    hideNativeSplash();
    return <ConfigErrorScreen missing={envState.missing} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider
          publishableKey={env.clerkPublishableKey}
          tokenCache={tokenCache}
        >
          <AuthTokenBridge />
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={persistOptions}
          >
            <SessionCacheGuard />
            <ThemeProvider>
              <Slot />
              <Toaster />
              <PortalHost />
            </ThemeProvider>
          </PersistQueryClientProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
