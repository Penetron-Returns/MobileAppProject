import * as React from 'react';
import { Platform } from 'react-native';

import {
  canDrawOverlays,
  isLauncherIconEnabled,
  requestAddTile,
  requestOverlayPermission,
  setLauncherIconEnabled,
  startTalk,
  type ClovieVoiceTileResult,
} from './clovieVoice';
import { requestVoicePermissions } from './permissions';

/** Android 13 added the system "add tile" prompt; older phones add the tile by hand. */
const CAN_PROMPT_FOR_TILE = Platform.OS === 'android' && Platform.Version >= 33;

/**
 * The one-tap "Talk to Clovie" entry points: the Quick Settings tile, the home-screen widget, the
 * app-icon shortcut, and the optional second launcher icon that Samsung's side key can open. The
 * mic is open only while the owner speaks; nothing here keeps it on.
 */
export function useOneTap() {
  const [tileResult, setTileResult] =
    React.useState<ClovieVoiceTileResult | null>(null);
  const [hasLauncherIcon, setHasLauncherIcon] = React.useState(
    isLauncherIconEnabled,
  );
  const [permissionDenied, setPermissionDenied] = React.useState(false);

  const addTile = React.useCallback(async () => {
    setTileResult(await requestAddTile());
  }, []);

  const setLauncherIcon = React.useCallback((on: boolean) => {
    setLauncherIconEnabled(on);
    setHasLauncherIcon(isLauncherIconEnabled());
  }, []);

  /** Asks for the microphone and notifications, then listens for one command now. */
  const tryIt = React.useCallback(async () => {
    setPermissionDenied(false);
    if (!(await requestVoicePermissions())) {
      setPermissionDenied(true);
      return;
    }
    if (!canDrawOverlays()) requestOverlayPermission();
    await startTalk();
  }, []);

  return {
    canPromptForTile: CAN_PROMPT_FOR_TILE,
    tileResult,
    addTile,
    hasLauncherIcon,
    setLauncherIcon,
    permissionDenied,
    tryIt,
  };
}

/**
 * `bookingadmin://voice/listen`: start listening and get out of the way. With no microphone
 * permission yet, the owner lands on the voice settings to grant it.
 */
export function useTalkOnOpen(done: () => void, grant: () => void) {
  const ran = React.useRef(false);
  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void startTalk().then((state) => {
      if (state.status === 'error' && state.error === 'permission_denied') {
        grant();
      } else {
        done();
      }
    });
  }, [done, grant]);
}
