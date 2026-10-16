/**
 * One-shot, short-lived prefetch of a value (today's bookings) started when the wake word fires, so the
 * command that follows a few seconds later does not wait for the load. Pure: the loader and the clock are injected.
 */
export interface Prefetcher<T> {
  /** Starts a load now and keeps its promise (replacing an older one). Never rejects. */
  prefetch: () => Promise<void>;
  /** The prefetched promise if it is still fresh, else null. Taking it consumes it: it is used at most once. */
  take: () => Promise<T> | null;
}

export function createPrefetcher<T>(options: {
  load: () => Promise<T>;
  now: () => number;
  ttlMs: number;
}): Prefetcher<T> {
  let entry: { startedAt: number; promise: Promise<T> } | null = null;
  return {
    prefetch() {
      const current = { startedAt: options.now(), promise: options.load() };
      entry = current;
      return current.promise.then(
        () => undefined,
        () => {
          // A failed prefetch is forgotten: the command loads for itself.
          if (entry === current) entry = null;
        },
      );
    },
    take() {
      const current = entry;
      entry = null;
      if (!current || options.now() - current.startedAt > options.ttlMs) {
        return null;
      }
      return current.promise;
    },
  };
}
