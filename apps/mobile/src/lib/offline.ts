import type { TFunction } from 'i18next';

import { ApiError } from '@/lib/api';
import { formatTime } from '@/lib/time';

interface QueryStatus {
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  dataUpdatedAt: number;
}

/**
 * True when a screen is showing a saved copy: it has data from an earlier
 * load but the latest refresh failed or is paused (no connection).
 */
export function isShowingSavedCopy(q: QueryStatus): boolean {
  if (q.dataUpdatedAt === 0) return false;
  return q.isError || q.fetchStatus === 'paused';
}

/** "10:32" in the business timezone, or null when nothing was ever loaded. */
export function savedCopyTime(
  dataUpdatedAt: number,
  timezone: string,
): string | null {
  return dataUpdatedAt ? formatTime(dataUpdatedAt, timezone) : null;
}

/** "Offline · showing what we had at 10:32", or the no-time wording when nothing was ever loaded. */
export function savedCopyLabel(t: TFunction, time: string | null): string {
  return time
    ? t('states.offline.banner', { time })
    : t('states.offline.bannerNoTime');
}

/** The error shown when the device has no connection (copy: `errors.codes.OFFLINE`). */
export function offlineError(): ApiError {
  return new ApiError({
    code: 'OFFLINE',
    message: "You're offline.",
    status: 0,
  });
}

export interface LoadStatus {
  isError: boolean;
  error: unknown;
  isPending: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

/**
 * Why a screen has nothing to show, or null when it has no reason to fail.
 * A query that is still pending but paused never loaded: the device is
 * offline and there is no saved copy, so it reads as an offline error rather
 * than an endless skeleton.
 */
export function loadError(q: LoadStatus): unknown {
  if (q.isError) return q.error;
  if (q.isPending && q.fetchStatus === 'paused') return offlineError();
  return null;
}

/**
 * True when `loadError` has something to show. As a guard it narrows like
 * `isError` does, so the branch that follows can rely on `data`.
 */
export function isFailed<Q extends LoadStatus>(
  q: Q,
): q is Extract<Q, { isError: true }> {
  return loadError(q) !== null;
}
