import { useClerk, useUser } from '@clerk/expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/query';

import type { NameInput } from './name';

/** What the join screen shows of a Clerk invitation. */
export interface PendingInvitation {
  id: string;
  organizationId: string;
  organizationName: string;
  imageUrl: string | null;
  /** Accepts on Clerk's side; the organisation is activated afterwards. */
  accept: () => Promise<unknown>;
}

const keys = {
  invitations: (userId: string | undefined) =>
    ['clerk', 'invitations', userId ?? 'none'] as const,
};

/**
 * The signed-in user's pending organisation invitations (Clerk). Asked only
 * while `enabled`, i.e. when the user has no organisation yet. Read from the
 * user resource: Clerk's organisation hooks stay unloaded for a `pending`
 * session, which is exactly the state of someone who has no business.
 */
export function usePendingInvitations(enabled: boolean) {
  const { user } = useUser();
  return useQuery({
    queryKey: keys.invitations(user?.id),
    enabled: enabled && Boolean(user),
    // An invitation may arrive while the app is open: always ask again.
    staleTime: 0,
    queryFn: async (): Promise<PendingInvitation[]> => {
      if (!user) return [];
      const page = await user.getOrganizationInvitations({
        status: 'pending',
      });
      return page.data.map((invitation) => ({
        id: invitation.id,
        organizationId: invitation.publicOrganizationData.id,
        organizationName: invitation.publicOrganizationData.name,
        imageUrl: invitation.publicOrganizationData.hasImage
          ? invitation.publicOrganizationData.imageUrl
          : null,
        accept: () => invitation.accept(),
      }));
    },
  });
}

/**
 * Accepts an invitation and makes its organisation the active one. The API
 * links the new login to the invited staff row on its first call, and names a
 * new staff row from the Clerk name, so a nameless person saves their name to
 * Clerk before accepting. `/v1/me` is dropped and fetched again as soon as the
 * organisation is active.
 */
export function useAcceptInvitation() {
  const { setActive } = useClerk();
  const { user } = useUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invitation,
      name,
    }: {
      invitation: PendingInvitation;
      name?: NameInput;
    }) => {
      if (name) await user?.update(name);
      await invitation.accept();
      // `navigate` is explicit: routing is driven by the (app) layout.
      await setActive({
        organization: invitation.organizationId,
        navigate: async () => {},
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.me });
      await queryClient.invalidateQueries({ queryKey: ['clerk'] });
    },
  });
}
