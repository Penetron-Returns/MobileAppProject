import type { TokenCache } from '@clerk/expo';
import { tokenCache as officialTokenCache } from '@clerk/expo/token-cache';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEEP_KEY = 'pref.keepSignedIn';

/**
 * Wraps Clerk's own secure-store-backed token cache (`@clerk/expo/token-cache`,
 * which chunks around SecureStore's item-size limit) with an app preference:
 * when the user unticks "Keep this device signed in", tokens live only in
 * memory for the rest of the process instead of on disk.
 */
const memory = new Map<string, string>();
let keepSignedIn = true;
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const v = await SecureStore.getItemAsync(KEEP_KEY);
    keepSignedIn = v !== 'false';
  } catch {
    keepSignedIn = true;
  }
}

export async function setKeepSignedIn(keep: boolean) {
  keepSignedIn = keep;
  loaded = true;
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.setItemAsync(KEEP_KEY, keep ? 'true' : 'false');
  } catch {
    // Best effort: fall back to the in-memory choice.
  }
}

function buildTokenCache(base: TokenCache): TokenCache {
  return {
    async getToken(key: string) {
      await ensureLoaded();
      if (memory.has(key)) return memory.get(key) ?? null;
      if (!keepSignedIn) return null;
      return base.getToken(key);
    },
    async saveToken(key: string, token: string) {
      await ensureLoaded();
      memory.set(key, token);
      if (!keepSignedIn) {
        await base.clearToken?.(key);
        return;
      }
      await base.saveToken(key, token);
    },
    async clearToken(key: string) {
      memory.delete(key);
      await base.clearToken?.(key);
    },
  };
}

export const tokenCache: TokenCache | undefined =
  Platform.OS === 'web' || !officialTokenCache
    ? undefined
    : buildTokenCache(officialTokenCache);
