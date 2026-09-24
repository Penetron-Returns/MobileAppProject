import { isApiError, newIdempotencyKey } from './api';

/** JSON.stringify with sorted object keys, so equal payloads get equal signatures. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/**
 * One key per user action. A retry of the same action (same payload, after a
 * retryable failure such as a timeout, 5xx or a double tap while in flight)
 * reuses the key so the API replays instead of acting twice. Any success,
 * a non-retryable error or a different payload starts a new action.
 */
export class IdempotencyTracker {
  private current: { sig: string; key: string } | null = null;

  constructor(private readonly mint: () => string = newIdempotencyKey) {}

  keyFor(vars: unknown): string {
    const sig = stableStringify(vars);
    if (this.current && this.current.sig === sig) return this.current.key;
    this.current = { sig, key: this.mint() };
    return this.current.key;
  }

  settle(error?: unknown) {
    if (!error) {
      this.current = null;
      return;
    }
    const retryable = isApiError(error)
      ? error.isRetryable
      : !(error instanceof Error && error.name === 'AbortError');
    if (!retryable) this.current = null;
  }

  /** Forget the pending action (e.g. the user changed the form). */
  reset() {
    this.current = null;
  }
}
