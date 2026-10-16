import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as React from 'react';
import { AppState, Platform } from 'react-native';

import { api, newIdempotencyKey } from '@/lib/api';
import { setDeviceTokenSource } from '@/lib/auth-token';
import { env } from '@/lib/env';

import {
  clearVoiceToken,
  getVoiceTokenState,
  setVoiceToken,
  type ClovieVoiceTokenState,
} from './clovieVoice';

/**
 * The device voice token lifecycle. A long-lived, scoped credential (backend `voice_device_tokens`)
 * that lets "Hey Clovie" upload a clip and a notification action answer an attendance check while the
 * app is backgrounded or killed and no Clerk session token is available. The app mints it while signed
 * in and on screen, keeps it in the OS secure store, and hands a copy to the native service (which
 * stores it encrypted). It is replaced when missing or refused (401), and revoked on sign-out.
 */

export const DEVICE_TOKEN_KEY = 'clovie_voice_device_token';
export const INSTALL_ID_KEY = 'clovie_voice_install_id';

export interface DeviceTokenDeps {
  secure: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  mint(deviceLabel: string): Promise<string>;
  revoke(): Promise<void>;
  native: {
    setToken(token: string, apiUrl: string): boolean;
    clear(): void;
    state(): ClovieVoiceTokenState;
  };
  apiUrl: string;
  platform: string;
  newId(): string;
}

/** One label per install, so a second phone of the same user does not revoke this one's token. */
async function deviceLabel(deps: DeviceTokenDeps): Promise<string> {
  let id = await deps.secure.get(INSTALL_ID_KEY);
  if (!id) {
    id = deps.newId();
    await deps.secure.set(INSTALL_ID_KEY, id);
  }
  return `${deps.platform}-${id.slice(0, 8)}`;
}

/**
 * Makes sure a usable token exists and the native side has a copy. Mints one when none is stored or the
 * service reported a 401. Throws on a failed mint (offline): the caller retries when the app next
 * comes to the foreground.
 */
export async function ensureDeviceToken(
  deps: DeviceTokenDeps,
): Promise<'minted' | 'reused'> {
  let token = await deps.secure.get(DEVICE_TOKEN_KEY);
  const refused = deps.native.state() === 'rejected';
  let result: 'minted' | 'reused' = 'reused';
  if (!token || refused) {
    token = await deps.mint(await deviceLabel(deps));
    await deps.secure.set(DEVICE_TOKEN_KEY, token);
    result = 'minted';
  }
  // Also on reuse: the native copy may be missing (reinstall of the native side) or the URL may differ.
  deps.native.setToken(token, deps.apiUrl);
  return result;
}

/** Forgets the token everywhere. The server-side revoke is best effort (it needs the live session). */
export async function clearDeviceToken(
  deps: DeviceTokenDeps,
  options: { revokeRemote: boolean },
): Promise<void> {
  if (options.revokeRemote) await deps.revoke().catch(() => undefined);
  await deps.secure.remove(DEVICE_TOKEN_KEY).catch(() => undefined);
  deps.native.clear();
}

export function defaultDeviceTokenDeps(): DeviceTokenDeps {
  return {
    secure: {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) => SecureStore.setItemAsync(key, value),
      remove: (key) => SecureStore.deleteItemAsync(key),
    },
    mint: async (label) =>
      (
        await api.mintVoiceDeviceToken(
          { device_label: label },
          newIdempotencyKey(),
        )
      ).token,
    revoke: async () => {
      await api.revokeVoiceDeviceToken(newIdempotencyKey());
    },
    native: {
      setToken: setVoiceToken,
      clear: clearVoiceToken,
      state: getVoiceTokenState,
    },
    apiUrl: env.apiUrl,
    platform: Platform.OS,
    newId: () => Crypto.randomUUID(),
  };
}

let inflight: Promise<unknown> | null = null;

/** Concurrent callers (foreground events) share one run. Never rejects. */
export function ensureDeviceTokenOnce(
  deps: DeviceTokenDeps = defaultDeviceTokenDeps(),
): Promise<void> {
  inflight ??= ensureDeviceToken(deps)
    .catch(() => undefined)
    .finally(() => {
      inflight = null;
    });
  return inflight.then(() => undefined);
}

/** Sign-out: revoke on the server while the session lives, then forget it locally and natively. */
export async function clearDeviceTokenOnSignOut(
  deps: DeviceTokenDeps = defaultDeviceTokenDeps(),
): Promise<void> {
  await clearDeviceToken(deps, { revokeRemote: true });
}

/**
 * Lets the API client fall back to the stored token for the voice upload and the attendance answer
 * (see `resolveBearer`). Safe to call before the UI exists, also from the headless JS task.
 */
export function registerDeviceTokenSource(): void {
  setDeviceTokenSource({
    get: () => SecureStore.getItemAsync(DEVICE_TOKEN_KEY),
    // Revoked or replaced: drop it so the next foreground mints a new one.
    onRejected: () => {
      void SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY).catch(() => undefined);
    },
  });
}

/** While signed in and on screen: ensure the token now and each time the app returns to the foreground. */
export function useVoiceDeviceToken(enabled: boolean): void {
  React.useEffect(() => {
    if (!enabled) return;
    void ensureDeviceTokenOnce();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void ensureDeviceTokenOnce();
    });
    return () => subscription.remove();
  }, [enabled]);
}
