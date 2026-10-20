import { useQuery } from '@tanstack/react-query';

import { api, isApiError } from '@/lib/api';
import { qk } from '@/lib/query';

const TOKEN_RETRIES = 6;

/** Clerk can lag a moment behind a fresh sign-in: no token yet is not a verdict. */
export function isTokenNotReady(error: unknown): boolean {
  return isApiError(error) && error.code === 'NOT_SIGNED_IN';
}

/**
 * Retry policy for `/v1/me`: a missing token is retried (bounded) because it
 * resolves itself right after sign-in; other client errors never retry.
 */
export function shouldRetryMe(count: number, error: unknown): boolean {
  if (isTokenNotReady(error)) return count < TOKEN_RETRIES;
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return false;
  }
  return count < 2;
}

/** 400ms, 800ms, 1.6s, then 2s: about 9s in total before giving up. */
export function meRetryDelay(attempt: number): number {
  return Math.min(400 * 2 ** attempt, 2000);
}

/** Caller's user, business and role (owner/staff) from the API. */
export function useMe(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.me,
    queryFn: api.me,
    staleTime: 5 * 60_000,
    enabled: opts.enabled ?? true,
    retry: shouldRetryMe,
    retryDelay: meRetryDelay,
  });
}

/** Hides owner-only controls once the API reports a staff role; the API enforces it regardless. */
export function useCanManage() {
  return useMe().data?.role !== 'staff';
}
