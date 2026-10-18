/**
 * Tracks this device's own writes so Realtime can ignore their echoes: the
 * mutation already refreshed what it changed, so the change event that follows
 * would only repeat the same fetch.
 */
const ECHO_WINDOW_MS = 2_000;

let inFlight = 0;
let lastSettledAt = Number.NEGATIVE_INFINITY;

export function noteMutationStart(): void {
  inFlight += 1;
}

export function noteMutationSettled(now: number = Date.now()): void {
  inFlight = Math.max(0, inFlight - 1);
  lastSettledAt = now;
}

/** True while an own write is running or finished a moment ago. */
export function isOwnEchoLikely(now: number = Date.now()): boolean {
  return inFlight > 0 || now - lastSettledAt < ECHO_WINDOW_MS;
}

/** Test helper. */
export function resetOwnMutations(): void {
  inFlight = 0;
  lastSettledAt = Number.NEGATIVE_INFINITY;
}
