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
