import type { CompanionColorMode, CompanionSessionDTO } from '@booking/types';
import type { CompanionSessionProvider } from '@nerova/react-native';
import * as React from 'react';

import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/query';

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
      api.createCompanionSession({ color_mode: mode }, key),
    // The SDK shows its own unavailable/offline states; no toast on top.
    onError: () => true,
  });
  const mintRef = React.useRef(mint.mutateAsync);
  mintRef.current = mint.mutateAsync;
  const modeRef = React.useRef(colorMode);
  modeRef.current = colorMode;

  return React.useCallback(async () => {
    const session = await mintRef.current(modeRef.current);
    return { url: session.url, expiresAt: session.expires_at };
  }, []);
}
