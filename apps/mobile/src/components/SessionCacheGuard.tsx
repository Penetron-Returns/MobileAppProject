import { useAuth } from '@clerk/expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsRestoring } from '@tanstack/react-query';
import * as React from 'react';

import { shouldClearCache, type SessionScope } from '@/features/auth/session';
import { queryClient } from '@/lib/query';
import {
  CACHE_SCOPE_KEY,
  cacheScopeKey,
  wipePersistedCache,
} from '@/lib/queryPersist';

/**
 * Clears the query cache (memory and the saved copy on disk) whenever the
 * session changes hands: sign-out from anywhere (this device, another device,
 * an expired session), a different user, or a different business. The saved
 * copy remembers whose it is, so a cold start restored for the wrong account
 * is dropped as soon as Clerk says who is signed in. Renders nothing.
 */
export function SessionCacheGuard() {
  const { userId, orgId, isLoaded } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const isRestoring = useIsRestoring();
  const scope = React.useRef<SessionScope | null>(null);

  React.useEffect(() => {
    if (isRestoring) return;
    const next: SessionScope = { userId: userId ?? null, orgId: orgId ?? null };
    if (shouldClearCache(scope.current, next)) {
      queryClient.clear();
      void wipePersistedCache();
    } else if (isLoaded !== false && !next.userId && !scope.current?.userId) {
      // Signed out at launch: whatever was saved belongs to a finished session.
      queryClient.clear();
      void wipePersistedCache();
    }
    scope.current = next;

    const key = cacheScopeKey(next.userId, next.orgId);
    if (!key) return;
    void AsyncStorage.getItem(CACHE_SCOPE_KEY)
      .then(async (saved) => {
        if (saved === key) return;
        if (saved) {
          queryClient.clear();
          await wipePersistedCache();
        }
        await AsyncStorage.setItem(CACHE_SCOPE_KEY, key);
      })
      .catch(() => undefined);
  }, [userId, orgId, isLoaded, isRestoring]);

  return null;
}
