import '../../global.css';
import '@/lib/i18n';
import { Toaster } from '@booking/ui';
import { ClerkProvider } from '@clerk/expo';
import { QueryClientProvider } from '@tanstack/react-query';
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
import { env, validateEnv } from '@/lib/env';
import { registerVoiceHeadlessTask } from '@/features/voice/headlessTask';
import { startOnlineSync } from '@/lib/online';
import { queryClient } from '@/lib/query';

const SPLASH_SAFETY_MS = 5000;
const envState = validateEnv();
startOnlineSync();
// Hey Clovie (Android): lets the voice service run a command with the app in the background.
registerVoiceHeadlessTask();
// Keep the native splash until a screen has drawn: the loading screen hides it on
// its first layout, other first screens through useHideSplashWhen.
holdNativeSplash();

export default function RootLayout() {
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
          <QueryClientProvider client={queryClient}>
            <SessionCacheGuard />
            <ThemeProvider>
              <Slot />
              <Toaster />
              <PortalHost />
            </ThemeProvider>
          </QueryClientProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
