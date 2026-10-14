import { OfflineBanner } from '@booking/ui';
import { useTranslation } from 'react-i18next';

import {
  isShowingSavedCopy,
  savedCopyLabel,
  savedCopyTime,
} from '@/lib/offline';

type Status = Parameters<typeof isShowingSavedCopy>[0];

/**
 * The one offline banner every data screen shows when it is displaying a
 * saved copy (loaded earlier, latest refresh failed or paused). Renders
 * nothing while the data is fresh.
 */
export function SavedCopyBanner({
  query,
  timezone,
}: {
  query: Status;
  /** Business timezone, for the "showing what we had at 10:32" time. */
  timezone?: string;
}) {
  const { t } = useTranslation();
  if (!isShowingSavedCopy(query)) return null;
  const time = timezone ? savedCopyTime(query.dataUpdatedAt, timezone) : null;
  return <OfflineBanner label={savedCopyLabel(t, time)} />;
}
