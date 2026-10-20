import * as Notifications from 'expo-notifications';
import * as React from 'react';
import { AppState } from 'react-native';

import {
  canReceivePush,
  fetchPushToken,
  getPushPermission,
  registerPushToken,
  requestPushPermission,
} from './pushDevice';
import { decidePushAction, isTokenRotation } from './pushLogic';
import { pushStore } from './pushStore';

async function registerQuietly(): Promise<void> {
  try {
    await registerPushToken(await fetchPushToken());
  } catch {
    // Offline, or Firebase / the EAS project id is not configured in this build. Retried on the next start.
  }
}

/**
 * Registers this phone for push once signed in with a business: silently when permission is already
 * granted, through a one-time primer when it is not yet decided. Re-registers on every app start,
 * on returning to the foreground and whenever Expo rotates the token.
 */
export function usePushRegistration(enabled: boolean) {
  const [primerOpen, setPrimerOpen] = React.useState(false);
  const isEvaluating = React.useRef(false);
  const lastDeviceToken = React.useRef<string | null>(null);

  const evaluate = React.useCallback(async () => {
    // Single flight: fetching the token re-emits the device token, which must not start another run.
    if (isEvaluating.current) return;
    isEvaluating.current = true;
    try {
      const action = decidePushAction({
        permission: await getPushPermission(),
        signedIn: true,
        hasBusiness: true,
        canReceivePush,
        optedOut: await pushStore.isOptedOut(),
        primerSeen: await pushStore.isPrimerSeen(),
      });
      if (action === 'register') await registerQuietly();
      else if (action === 'show-primer') setPrimerOpen(true);
    } finally {
      isEvaluating.current = false;
    }
  }, []);

  React.useEffect(() => {
    if (!enabled || !canReceivePush) return;
    void evaluate();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void evaluate();
    });
    const rotation = Notifications.addPushTokenListener((token) => {
      const rotated = isTokenRotation(lastDeviceToken.current, token.data);
      lastDeviceToken.current = token.data;
      if (rotated) void evaluate();
    });
    return () => {
      appState.remove();
      rotation.remove();
    };
  }, [enabled, evaluate]);

  const accept = React.useCallback(async () => {
    setPrimerOpen(false);
    await pushStore.markPrimerSeen();
    if (await requestPushPermission()) {
      await pushStore.setOptedOut(false);
      await registerQuietly();
    }
  }, []);

  const decline = React.useCallback(() => {
    setPrimerOpen(false);
    void pushStore.markPrimerSeen();
  }, []);

  return { primerOpen, accept, decline };
}
