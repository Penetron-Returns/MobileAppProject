import { whenIdle } from './whenIdle';

/** Extra quiet time after the first idle, so the first screen has drawn and settled. */
const SHELL_SETTLE_MS = 1200;

let gate: Promise<void> | null = null;

/**
 * Resolves once the app has been idle for a moment after launch (and stays
 * resolved). Background work that the first screen does not need (minting the
 * companion session, warming the thread) awaits this instead of competing with
 * the first paint.
 */
export function shellIdle(delayMs: number = SHELL_SETTLE_MS): Promise<void> {
  gate ??= new Promise<void>((resolve) => {
    whenIdle(() => {
      setTimeout(resolve, delayMs);
    });
  });
  return gate;
}

/** Test helper. */
export function resetShellIdleForTests(): void {
  gate = null;
}
