import { useAuth } from '@clerk/expo';
import * as React from 'react';

import { shouldClearCache, type SessionScope } from '@/features/auth/session';
import { queryClient } from '@/lib/query';

/**
 * Clears the query cache whenever the session changes hands: sign-out from
 * anywhere (this device, another device, an expired session), a different
 * user, or a different business. Renders nothing.
 */
export function SessionCacheGuard() {
  const { userId, orgId } = useAuth({ treatPendingAsSignedOut: false });
  const scope = React.useRef<SessionScope | null>(null);

  React.useEffect(() => {
    const next: SessionScope = { userId: userId ?? null, orgId: orgId ?? null };
    if (shouldClearCache(scope.current, next)) queryClient.clear();
    scope.current = next;
  }, [userId, orgId]);

  return null;
}
