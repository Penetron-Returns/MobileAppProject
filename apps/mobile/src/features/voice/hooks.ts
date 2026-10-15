import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { AppState } from 'react-native';

import {
  addStatusListener,
  canDrawOverlays,
  getStatus,
  isSupported,
  requestOverlayPermission,
  start,
  stop,
  type ClovieVoiceState,
} from './clovieVoice';
import { requestVoicePermissions } from './permissions';
import { isVoiceOn } from './status';

const STORAGE_KEY = 'pref.heyClovieEnabled';

/**
 * The "Hey Clovie" switch: permissions, the native service and the saved
 * preference. Android only (`isSupported` is false elsewhere). The service
 * can only be started from the foreground, so a saved "on" that the system
 * stopped (reboot, force-stop) is restarted when this screen opens, not
 * silently from the background.
 */
export function useHeyClovie() {
  const supported = isSupported();
  const [state, setState] = React.useState<ClovieVoiceState>(getStatus);
  const [isPending, setIsPending] = React.useState(false);
  const [permissionDenied, setPermissionDenied] = React.useState(false);
  const [canOverlay, setCanOverlay] = React.useState(canDrawOverlays);

  // The owner grants the overlay in system settings: re-check when they come back.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setCanOverlay(canDrawOverlays());
    });
    return () => sub.remove();
  }, []);

  React.useEffect(() => addStatusListener(setState), []);

  const turnOn = React.useCallback(async () => {
    setIsPending(true);
    setPermissionDenied(false);
    try {
      if (!(await requestVoicePermissions())) {
        setPermissionDenied(true);
        return;
      }
      setState(await start({}));
      // The service works without it (results come as notifications), but the overlay is the real UI.
      if (!canDrawOverlays()) requestOverlayPermission();
      await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => undefined);
    } finally {
      setIsPending(false);
    }
  }, []);

  const turnOff = React.useCallback(() => {
    setState(stop());
    AsyncStorage.setItem(STORAGE_KEY, 'false').catch(() => undefined);
  }, []);

  // Restart a service the system stopped, but only with the app on screen.
  React.useEffect(() => {
    if (!supported || AppState.currentState !== 'active') return;
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && saved === 'true' && getStatus().status === 'off') {
          void start({}).then((next) => !cancelled && setState(next));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [supported]);

  return {
    supported,
    state,
    isOn: isVoiceOn(state.status),
    isPending,
    permissionDenied,
    canOverlay,
    requestOverlay: requestOverlayPermission,
    turnOn,
    turnOff,
  };
}
