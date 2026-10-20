import type { AccountDeletionPreviewDTO } from '@booking/types';
import { useClerk } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { qk, queryClient, useApiMutation } from '@/lib/query';

/** What deleting the signed-in user's account would do (does the business go too?). */
export function useAccountDeletionPreview() {
  return useQuery<AccountDeletionPreviewDTO>({
    queryKey: qk.accountDeletionPreview,
    queryFn: api.accountDeletionPreview,
  });
}

/**
 * Deletes the account on the server, then drops this phone's session and caches. The Clerk user no longer
 * exists, so the remote token revoke is skipped (the server already revoked every token) and a failing
 * sign-out is ignored: the session is dead either way.
 */
export function useDeleteAccount(onDone: () => void) {
  const { signOut } = useClerk();
  return useApiMutation<{ confirmBusinessName?: string }>({
    mutationFn: ({ confirmBusinessName }, key) =>
      api.deleteAccount(
        confirmBusinessName === undefined
          ? {}
          : { confirm_business_name: confirmBusinessName },
        key,
      ),
    onSuccess: () => {
      void (async () => {
        await signOut().catch(() => undefined);
        queryClient.clear();
        onDone();
      })();
    },
  });
}

/** True once the typed text equals the business name (trimmed, case-insensitive), as the API checks. */
export function matchesBusinessName(typed: string, name: string): boolean {
  return (
    typed.trim().length > 0 &&
    typed.trim().toLowerCase() === name.trim().toLowerCase()
  );
}

export function useTypedConfirmation(name: string) {
  const [typed, setTyped] = React.useState('');
  return { typed, setTyped, isMatch: matchesBusinessName(typed, name) };
}
