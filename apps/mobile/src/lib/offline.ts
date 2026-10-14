import type { TFunction } from 'i18next';

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
