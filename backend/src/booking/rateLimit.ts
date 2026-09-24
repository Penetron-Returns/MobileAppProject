/**
 * Best-effort fixed-window rate limiter, in memory per warm function
 * instance. It is the only hidden state in the booking core: it resets on
 * cold start and is not shared across instances, so it only blunts bursts
 * from one client. Keys (client IPs) are never logged.
 */
export interface RateLimiter {
  /** Records a hit; returns false when the key is over its limit for the current window. */
  hit(key: string, nowMs?: number): boolean;
  reset(): void;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys; stale windows are pruned beyond it */
  maxKeys?: number;
}

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: RateLimitOptions): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  function prune(now: number) {
    for (const [key, w] of windows) if (now - w.start >= windowMs) windows.delete(key);
  }

  return {
    hit(key, nowMs = Date.now()) {
      let w = windows.get(key);
      if (!w || nowMs - w.start >= windowMs) {
        if (!w && windows.size >= maxKeys) prune(nowMs);
        w = { start: nowMs, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      return w.count <= limit;
    },
    reset() {
      windows.clear();
    },
  };
}

/** Client IP from the platform proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(header: (name: string) => string | undefined): string {
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || header('x-real-ip')?.trim() || 'unknown';
}
