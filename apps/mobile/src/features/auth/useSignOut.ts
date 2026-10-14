import { useClerk } from '@clerk/expo';
import * as React from 'react';

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
    try {
      await signOut();
    } catch (error) {
      toast.error(error);
      return;
    }
    queryClient.clear();
  }, [signOut]);
}
