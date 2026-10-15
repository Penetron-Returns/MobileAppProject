import * as React from 'react';
import { AppState } from 'react-native';

import {
  addStatusListener,
  canDrawOverlays,
  configureHandsFree,
  getHandsFree,
  getStatus,
  isSupported,
  requestOverlayPermission,
  start,
  stop,
  type ClovieVoiceHandsFree,
  type ClovieVoiceState,
} from './clovieVoice';
import type { DutyConditions } from './duty';
import { requestVoicePermissions } from './permissions';

/** The duty text changes with the clock and the charger: re-read now and then. */
const REFRESH_MS = 30_000;

/**
 * Hands-free ("Hey Clovie"): permissions, the native service and its conditions. Android only
 * (`isSupported` is false elsewhere). The native side keeps the switch and the conditions, so they
 * survive the app closing; a service the system stopped (reboot, force-stop) is restarted when this
 * screen opens, because Android only lets a microphone service start with the app on screen.
 */
export function useHeyClovie() {
  const supported = isSupported();
  const [state, setState] = React.useState<ClovieVoiceState>(getStatus);
  const [handsFree, setHandsFree] =
    React.useState<ClovieVoiceHandsFree>(getHandsFree);
  const [isPending, setIsPending] = React.useState(false);
  const [permissionDenied, setPermissionDenied] = React.useState(false);
  const [canOverlay, setCanOverlay] = React.useState(canDrawOverlays);

  const refresh = React.useCallback(() => {
    setState(getStatus());
    setHandsFree(getHandsFree());
  }, []);

  React.useEffect(
    () =>
      addStatusListener((next) => {
        setState(next);
        setHandsFree(getHandsFree());
      }),
    [],
  );

  React.useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS);
    // The owner grants the overlay in system settings: re-check when they come back.
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      setCanOverlay(canDrawOverlays());
      refresh();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refresh]);

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
      refresh();
    } finally {
      setIsPending(false);
    }
  }, [refresh]);

  const turnOff = React.useCallback(() => {
    setState(stop());
    refresh();
  }, [refresh]);

  const setConditions = React.useCallback(
    (conditions: Partial<DutyConditions>) => {
      configureHandsFree(conditions);
      refresh();
    },
    [refresh],
  );

  // Restart a service the system stopped, but only with the app on screen.
  React.useEffect(() => {
    if (!supported || AppState.currentState !== 'active') return;
    if (getHandsFree().enabled && getStatus().status === 'off') {
      void start({}).then(refresh);
    }
  }, [supported, refresh]);

  return {
    supported,
    state,
    handsFree,
    isOn: handsFree.enabled,
    isPending,
    permissionDenied,
    canOverlay,
    requestOverlay: requestOverlayPermission,
    turnOn,
    turnOff,
    setConditions,
  };
}
