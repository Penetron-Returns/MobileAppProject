import type {
  CompanionColorMode,
  CompanionSessionDTO,
  CreateCompanionSessionRequest,
} from '@booking/types';
import type { CompanionSessionProvider } from '@nerova/react-native';
import * as React from 'react';

import { api } from '@/lib/api';
import { nerovaApi } from '@/lib/env';
import { useApiMutation } from '@/lib/query';

function sessionBody(mode: CompanionColorMode): CreateCompanionSessionRequest {
  return nerovaApi === 'v1'
    ? { color_mode: mode, platform: 'native' }
    : { color_mode: mode };
}

/**
 * The SDK's `sessionProvider`: mints the owner-chat session through our own
 * `POST /v1/companion/session` (same endpoint and colour-mode parameter as the
 * iframe path) and hands the SDK the URL and its expiry. The SDK refreshes at
 * 80% of the lifetime and re-mints on `session_expired`, so no timer here. The
 * URL is a secret: it is returned to the SDK only, never logged. The identity
 * is stable, so the provider never re-mints because we re-rendered.
 */
export function useSdkSessionProvider(
  colorMode: CompanionColorMode,
): CompanionSessionProvider {
  const mint = useApiMutation<CompanionColorMode, CompanionSessionDTO>({
    mutationFn: (mode, key) =>
      api.createCompanionSession(sessionBody(mode), key),
    // The SDK shows its own unavailable/offline states; no toast on top.
    onError: () => true,
  });
  const mintRef = React.useRef(mint.mutateAsync);
  mintRef.current = mint.mutateAsync;
  const modeRef = React.useRef(colorMode);
  modeRef.current = colorMode;

  return React.useCallback(async () => {
    const session = await mintRef.current(modeRef.current);
    if (nerovaApi !== 'v1') {
      return { url: session.url, expiresAt: session.expires_at };
    }
    // Native sessions (v1): the SDK sends these on every call. All of them are
    // secrets, so nothing here is logged.
    return {
      sessionId: session.session_id,
      state: session.state ?? undefined,
      expiresAt: session.expires_at,
      url: session.url,
    };
  }, []);
}
