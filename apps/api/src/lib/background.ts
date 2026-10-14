/**
 * Fire-and-forget side effects (outbound notifications) that must never delay or fail the request that
 * caused them. The promise is always caught; on Supabase Edge Functions `EdgeRuntime.waitUntil` keeps the
 * isolate alive until it settles, elsewhere (Node tests) the promise simply runs on.
 */
import type { Logger } from './logger.ts';

interface WaitUntilRuntime {
  waitUntil?: (promise: Promise<unknown>) => void;
}

export function runInBackground(task: () => Promise<unknown>, logger: Logger, event: string): void {
  const settled = Promise.resolve()
    .then(task)
    .catch((error: unknown) => logger.warn(event, { error }));
  const runtime = (globalThis as { EdgeRuntime?: WaitUntilRuntime }).EdgeRuntime;
  runtime?.waitUntil?.(settled);
}
