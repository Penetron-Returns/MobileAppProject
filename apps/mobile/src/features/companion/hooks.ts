import type { CompanionColorMode, CompanionSessionDTO } from '@booking/types';
import * as React from 'react';

import { api, isApiError } from '@/lib/api';
import { useApiMutation } from '@/lib/query';

import { REFRESH_RETRY_MS, refreshDelayMs } from './logic';

export type CompanionSessionState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'not_ready'; details: Record<string, unknown> | undefined }
  | { status: 'error'; error: unknown };

/**
 * Mints the owner-chat session and keeps it alive: a new one about a minute
 * before `expires_at`, and at once when the frame reports `session_expired`.
 * A failed early refresh keeps the working chat and tries again; only a
 * failure with nothing to show becomes an error. The URL is a secret and is
 * only ever handed to the frame, never logged or put in an error.
 */
export function useCompanionSession(colorMode: CompanionColorMode) {
  const mint = useApiMutation<CompanionColorMode, CompanionSessionDTO>({
    mutationFn: (mode, key) =>
      api.createCompanionSession({ color_mode: mode }, key),
    // The sheet shows its own states; no toast on top.
    onError: () => true,
  });
  const mintRef = React.useRef(mint.mutateAsync);
  mintRef.current = mint.mutateAsync;

  const [session, setSession] = React.useState<CompanionSessionDTO | null>(
    null,
  );
  const [state, setState] = React.useState<CompanionSessionState>({
    status: 'loading',
  });
  const [retries, setRetries] = React.useState(0);
  const hasSession = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = React.useCallback(
    async (opts: { silent: boolean }) => {
      if (!opts.silent) setState({ status: 'loading' });
      try {
        const next = await mintRef.current(colorMode);
        if (!alive.current) return;
        hasSession.current = true;
        setSession(next);
        setRetries(0);
        setState({ status: 'ready', url: next.url });
      } catch (error) {
        if (!alive.current) return;
        if (opts.silent && hasSession.current) {
          setRetries((n) => n + 1);
          return;
        }
        hasSession.current = false;
        setSession(null);
        setState(
          isApiError(error) && error.code === 'COMPANION_NOT_READY'
            ? { status: 'not_ready', details: error.details }
            : { status: 'error', error },
        );
      }
    },
    [colorMode],
  );

  // First session, and a new one when the theme changes (Nerova takes no live restyle).
  React.useEffect(() => {
    void refresh({ silent: false });
  }, [refresh]);

  const expiresAt = session?.expires_at ?? null;
  React.useEffect(() => {
    if (!expiresAt) return;
    const delay =
      retries > 0 ? REFRESH_RETRY_MS : refreshDelayMs(expiresAt, Date.now());
    const id = setTimeout(() => void refresh({ silent: true }), delay);
    return () => clearTimeout(id);
  }, [expiresAt, retries, refresh]);

  return {
    state,
    /** The frame said its session ended: mint another straight away. */
    onSessionExpired: React.useCallback(
      () => void refresh({ silent: false }),
      [refresh],
    ),
    retry: React.useCallback(() => void refresh({ silent: false }), [refresh]),
  };
}
