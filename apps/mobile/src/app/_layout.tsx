import '../../global.css';
import '@/lib/interop';
import '@/lib/i18n';

import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@/lib/clerk-token-cache';
import { QueryClientProvider } from '@tanstack/react-query';
import { PortalHost } from '@rn-primitives/portal';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthTokenBridge } from '@/components/AuthTokenBridge';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/Toaster';
import { env, validateEnv } from '@/lib/env';
import { queryClient } from '@/lib/query';

const envState = validateEnv();

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
