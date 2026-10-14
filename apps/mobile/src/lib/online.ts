import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import * as React from 'react';

/**
 * Offline unless the OS says there is a connection and has not found the
 * internet unreachable. `null` means "not known yet": treat it as online so
 * the first requests are not held back by a slow connectivity probe.
 */
export function isOnlineFromNetInfo(
  state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * Feeds the device's connectivity into TanStack's `onlineManager`, which is
 * what pauses queries offline and resumes them on reconnect. Call once at
 * startup; returns the unsubscribe function.
 */
export function startOnlineSync(): () => void {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(isOnlineFromNetInfo(state))),
  );
  return () => onlineManager.setEventListener(() => () => {});
}

/** Live connectivity for UI that must change when the connection does. */
export function useIsOnline(): boolean {
  return React.useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );
}
