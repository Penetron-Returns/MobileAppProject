import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api, newIdempotencyKey } from '@/lib/api';

import { shouldRegisterToken, type PushPermission } from './pushLogic';
import { pushStore } from './pushStore';

export type DevicePlatform = 'ios' | 'android' | 'web';

export const canReceivePush = Device.isDevice && Platform.OS !== 'web';

export async function getPushPermission(): Promise<PushPermission> {
  if (!canReceivePush) return 'denied';
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return 'granted';
  return current.canAskAgain && current.status === 'undetermined'
    ? 'undetermined'
    : 'denied';
}

/** Android 13+ needs a channel before it will ask for permission. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Clovie',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Shows the system permission prompt; resolves to whether push is now allowed. */
export async function requestPushPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** The Expo push token. Needs permission already; throws when Firebase / the EAS project is not configured. */
export async function fetchPushToken(): Promise<string> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as
    string | undefined;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  return token.data;
}

let lastRegistered: { token: string; at: number } | null = null;

/** Idempotent: the API upserts per token, so calling this on every start is safe. */
export async function registerPushToken(token: string): Promise<void> {
  if (!shouldRegisterToken(lastRegistered, token, Date.now())) return;
  lastRegistered = { token, at: Date.now() };
  await api.registerDevice(
    { token, platform: Platform.OS as DevicePlatform },
    newIdempotencyKey(),
  );
  await pushStore.setToken(token);
}

/** Sign-out or switching push off: stop pushes to this phone. Best effort. */
export async function unregisterPushToken(): Promise<void> {
  const token = await pushStore.getToken();
  if (!token) return;
  try {
    await api.unregisterDevice({ token }, newIdempotencyKey());
  } catch {
    return; // keep the stored token so the next sign-out or switch-off retries
  }
  await pushStore.setToken(null);
  lastRegistered = null;
}
