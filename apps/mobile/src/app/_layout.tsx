import '../../global.css';
import '@/lib/i18n';
import { Toaster } from '@booking/ui';
import { ClerkProvider } from '@clerk/expo';
import { QueryClientProvider } from '@tanstack/react-query';
import { PortalHost } from '@rn-primitives/portal';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokenCache } from '@/lib/clerk-token-cache';
import { AuthTokenBridge } from '@/components/AuthTokenBridge';
import { SessionCacheGuard } from '@/components/SessionCacheGuard';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { ThemeProvider } from '@/components/ThemeProvider';
import { env, validateEnv } from '@/lib/env';
import { startOnlineSync } from '@/lib/online';
import { queryClient } from '@/lib/query';

const envState = validateEnv();
startOnlineSync();

export default function RootLayout() {
  if (!envState.ok) {
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
