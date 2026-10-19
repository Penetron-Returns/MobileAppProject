import { useClerk } from '@clerk/expo';
import * as React from 'react';

import { analytics } from '@/features/analytics';
import { clearOnboardingStorage } from '@/features/onboarding/storage';
import { unregisterPushToken } from '@/features/notifications/pushDevice';
import { queryClient } from '@/lib/query';
import { toast } from '@/lib/toast';

/**
 * Signs out of Clerk, then empties the query cache so none of this account's
 * business data survives into the next sign-in. Every sign-out button uses it.
 * A failed sign-out leaves the session (and its cache) as it was.
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useClerk();
  return React.useCallback(async () => {
    // Stop pushes for this account to this phone (needs the live session too).
    await unregisterPushToken().catch(() => undefined);
    try {
      await signOut();
    } catch (error) {
      toast.error(error);
      return;
    }
    // A half-finished draft belongs to this account, not the next one.
    await clearOnboardingStorage().catch(() => undefined);
    queryClient.clear();
    analytics.reset();
  }, [signOut]);
}
