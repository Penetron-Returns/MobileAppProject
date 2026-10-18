import { AppState, type AppStateStatus } from 'react-native';

/** Clerk session tokens live about a minute: refresh a little before that. */
export const TOKEN_PREWARM_MS = 45_000;

interface PrewarmDeps {
  getToken: () => Promise<string | null>;
  /** Subscribes to app state changes; returns the unsubscribe. */
  onAppState?: (cb: (state: AppStateStatus) => void) => () => void;
  currentState?: () => AppStateStatus;
  intervalMs?: number;
}

/**
 * Keeps the Clerk token fresh while the app is in the foreground, so the first
 * request after a pause does not wait on a token round trip. Warms on return to
 * the foreground, then on a timer until backgrounded. Returns a stop function.
 */
export function startTokenPrewarm({
  getToken,
  onAppState = (cb) => {
    const sub = AppState.addEventListener('change', cb);
    return () => sub.remove();
  },
  currentState = () => AppState.currentState,
  intervalMs = TOKEN_PREWARM_MS,
}: PrewarmDeps): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const warm = () => void getToken().catch(() => undefined);
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startTimer = () => {
    if (!timer) timer = setInterval(warm, intervalMs);
  };
  const apply = (state: AppStateStatus) => {
    if (state === 'active') {
      warm();
      startTimer();
    } else {
      stopTimer();
    }
  };
  apply(currentState());
  const unsubscribe = onAppState(apply);
  return () => {
    unsubscribe();
    stopTimer();
  };
}
