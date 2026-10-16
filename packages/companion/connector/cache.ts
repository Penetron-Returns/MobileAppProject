/**
 * Small in-isolate TTL + LRU cache for the connector's static-ish reads (catalogue, staff, hours, plan flags).
 * Entries are the in-flight promise, so concurrent callers share one load; a failed load is never kept.
 * Per isolate only: another isolate may serve a value up to `ttlMs` stale, which is why availability results
 * and appointments are never cached (the create/reschedule RPCs re-validate live).
 */
export interface TtlCacheOptions {
  ttlMs: number;
  maxEntries: number;
  /** Monotonic-ish millisecond clock; injected so tests do not sleep */
  nowMs?: () => number;
}

export interface TtlCache<V> {
  get(key: string, load: () => Promise<V>): Promise<V>;
  /** Drops every entry whose key starts with `prefix` (all entries when omitted) */
  invalidate(prefix?: string): void;
  readonly size: number;
}

export function createTtlCache<V>(options: TtlCacheOptions): TtlCache<V> {
  const nowMs = options.nowMs ?? Date.now;
  const entries = new Map<string, { expiresAt: number; value: Promise<V> }>();

  return {
    get(key, load) {
      const now = nowMs();
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now) {
        // Re-insert so the Map order stays least-recently-used first.
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
      }
      entries.delete(key);
      const value = load();
      const entry = { expiresAt: now + options.ttlMs, value };
      entries.set(key, entry);
      value.catch(() => {
        if (entries.get(key) === entry) entries.delete(key);
      });
      while (entries.size > options.maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      return value;
    },
    invalidate(prefix) {
      for (const key of [...entries.keys()]) if (!prefix || key.startsWith(prefix)) entries.delete(key);
    },
    get size() {
      return entries.size;
    },
  };
}
