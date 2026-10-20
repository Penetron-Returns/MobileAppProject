import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';
import Constants from 'expo-constants';

/** How long a saved cache may be used for the first paint of a cold start. */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60_000;

/** A new app version never reads an older version's cache shape. */
export const PERSIST_BUSTER = Constants.expoConfig?.version ?? 'dev';

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'clovie.query-cache.v1',
  throttleTime: 2_000,
});

/** Stored next to the cache so a different user or business never reads it. */
export const CACHE_SCOPE_KEY = 'clovie.query-cache.scope';

/**
 * Query roots that are stable enough to paint from a saved copy while the
 * live one loads. Availability (days and slots), and conversations are
 * deliberately absent: they must be live.
 */
const PERSISTED_ROOTS = new Set([
  'me',
  'business',
  'staff',
  'staff-services',
  'services',
  'business-hours',
  'attendance',
]);

/** Which cached queries are written to disk. Pure: tested as a table. */
export function isPersistableKey(key: QueryKey): boolean {
  const [root, second] = key;
  if (typeof root !== 'string') return false;
  if (root === 'appointments') return second === 'range';
  if (root === 'clients') return second === 'book';
  return PERSISTED_ROOTS.has(root);
}

export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>) {
  return query.state.status === 'success' && isPersistableKey(query.queryKey);
}

/** The scope string a cache belongs to; null until the business is known. */
export function cacheScopeKey(
  userId: string | null,
  orgId: string | null,
): string | null {
  return userId && orgId ? `${userId}:${orgId}` : null;
}

/** Persisted queries must outlive the app, so they are kept in memory as long as they may be restored. */
export function applyPersistedGcTimes(qc: QueryClient) {
  const roots: QueryKey[] = [
    ['me'],
    ['business'],
    ['staff'],
    ['staff-services'],
    ['services'],
    ['business-hours'],
    ['attendance'],
    ['appointments', 'range'],
    ['clients', 'book'],
  ];
  for (const queryKey of roots) {
    qc.setQueryDefaults(queryKey, { gcTime: PERSIST_MAX_AGE_MS });
  }
}

/** Forget the saved cache (sign-out or another account). */
export async function wipePersistedCache(): Promise<void> {
  await persister.removeClient();
  await AsyncStorage.removeItem(CACHE_SCOPE_KEY).catch(() => undefined);
}
