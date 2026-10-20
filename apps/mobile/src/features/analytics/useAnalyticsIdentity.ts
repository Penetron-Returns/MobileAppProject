import * as React from 'react';

import { analytics } from './analytics';

/**
 * Links this device to the signed-in user and, once it exists, their business.
 * Ids only: PostHog joins the anonymous pre-sign-in events to the user on
 * `identify`. Each id is sent once per change.
 */
export function useAnalyticsIdentity(
  userId: string | null | undefined,
  businessId: string | null | undefined,
): void {
  React.useEffect(() => {
    if (userId) analytics.identify(userId);
  }, [userId]);
  React.useEffect(() => {
    if (businessId) analytics.group('business', businessId);
  }, [businessId]);
}
