import { useAuth } from '@clerk/expo';
import * as React from 'react';

import { setAuthTokenGetter } from '@/lib/auth-token';

/**
 * Registers Clerk's `getToken` with the non-React auth-token bridge so
 * `src/lib/supabase.ts` (Supabase's `accessToken` option) and
 * `src/lib/api.ts` (the bearer header) can read the current session token
 * without needing a hook. Renders nothing.
 */
export function AuthTokenBridge() {
  const { getToken } = useAuth();
  const getTokenRef = React.useRef(getToken);
  getTokenRef.current = getToken;

  React.useEffect(() => {
    setAuthTokenGetter(() => getTokenRef.current());
  }, []);

  return null;
}
