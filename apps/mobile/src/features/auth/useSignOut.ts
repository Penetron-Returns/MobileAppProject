import { useClerk } from '@clerk/expo';
import * as React from 'react';

import { analytics } from '@/features/analytics';
import { clearOnboardingStorage } from '@/features/onboarding/storage';
import { unregisterPushToken } from '@/features/notifications/pushDevice';
import { clearDeviceTokenOnSignOut } from '@/features/voice/deviceToken';
import { queryClient } from '@/lib/query';
import { toast } from '@/lib/toast';

/**
 * Signs out of Clerk, then empties the query cache so none of this account's
 * business data survives into the next sign-in. Every sign-out button uses it.
 * A failed sign-out leaves the session (and its cache) as it was; the device voice
 * token is revoked first (the app re-mints it on its next foreground).
 */
export function useSignOut(): () => Promise<void> {
  const { signOut } = useClerk();
  return React.useCallback(async () => {
    // While the session is live: revoke the device voice token server-side, then forget it here and natively.
    await clearDeviceTokenOnSignOut().catch(() => undefined);
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
