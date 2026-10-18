import type {
  CompanionColorMode,
  CompanionSessionDTO,
  CompanionWhatsAppConnectSessionDTO,
} from '@booking/types';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import * as React from 'react';

import { api, isApiError } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';

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

/**
 * Nerova's setup state for the owner: the next step and whether WhatsApp is
 * connected. `pollMs` (while the connect tab is open) re-asks on a timer;
 * either way it refetches when the app returns to the foreground, since the
 * owner leaves for the browser tab and comes back.
 */
export function useCompanionSetup(
  opts: { enabled: boolean; pollMs?: number | false } = { enabled: true },
) {
  const query = useQuery({
    queryKey: qk.companionSetup,
    queryFn: api.companionSetup,
    enabled: opts.enabled,
    refetchInterval: opts.pollMs || false,
    staleTime: 30_000,
    // The owner leaves for the browser tab and comes back: TanStack's focus
    // manager (fed by AppState) refetches even a fresh result on return.
    refetchOnWindowFocus: 'always',
  });
  return query;
}

/**
 * Starts the WhatsApp connect flow: mints a launch URL and opens it in the
 * system browser tab (the chat widget's own popup is blocked in the
 * WebView). The URL is a secret and is never logged. `onClosed` fires when
 * the tab is dismissed. The card shows its own errors, so no toast.
 */
export function useConnectWhatsApp(handlers: {
  onOpened: () => void;
  onClosed: () => void;
  onAlreadyConnected: () => void;
  onFailed: (error: unknown) => void;
}) {
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;
  const mint = useApiMutation<void, CompanionWhatsAppConnectSessionDTO>({
    mutationFn: (_vars, key) => api.createCompanionWhatsAppSession(key),
    onError: (error) => {
      if (isApiError(error) && error.code === 'WHATSAPP_ALREADY_CONNECTED') {
        handlersRef.current.onAlreadyConnected();
      } else {
        handlersRef.current.onFailed(error);
      }
      return true;
    },
  });
  const { mutateAsync } = mint;
  const start = React.useCallback(async () => {
    let session: CompanionWhatsAppConnectSessionDTO;
    try {
      session = await mutateAsync();
    } catch {
      return; // reported through onError above
    }
    try {
      handlersRef.current.onOpened();
      await WebBrowser.openBrowserAsync(session.launch_url);
    } catch (error) {
      handlersRef.current.onFailed(error);
      return;
    }
    handlersRef.current.onClosed();
  }, [mutateAsync]);
  return { start, isStarting: mint.isPending };
}
