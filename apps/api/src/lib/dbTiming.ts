/**
 * Per-request database timing. Every supabase-js query is one HTTPS call to PostgREST, so wrapping `fetch`
 * counts round trips exactly. Stats follow the request through async work via AsyncLocalStorage; outside a
 * `withDbTiming` scope the wrapper is a plain pass-through. Nothing here sees URLs, bodies or rows.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface DbStats {
  /** Round trips made */
  calls: number;
  /** Sum of each call's duration; parallel calls overlap, so this can exceed the wall-clock time */
  ms: number;
}

const scope = new AsyncLocalStorage<DbStats>();

export function timedFetch(base: typeof fetch = (input, init) => globalThis.fetch(input, init)): typeof fetch {
  return async (input, init) => {
    const stats = scope.getStore();
    if (!stats) return base(input, init);
    const started = performance.now();
    try {
      return await base(input, init);
    } finally {
      stats.calls += 1;
      stats.ms += performance.now() - started;
    }
  };
}

export async function withDbTiming<T>(run: () => Promise<T>): Promise<{ result: T; stats: DbStats }> {
  const stats: DbStats = { calls: 0, ms: 0 };
  const result = await scope.run(stats, run);
  return { result, stats };
}
