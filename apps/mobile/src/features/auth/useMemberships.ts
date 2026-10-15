import { useUser } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';

/**
 * The signed-in user's organisation ids, fetched from Clerk. `user.
 * organizationMemberships` is empty on a fresh sign-in (the sign-in response
 * does not carry it), so reading it alone made an existing owner look like
 * someone with no business. Asked only while `enabled`.
 */
export function useMembershipOrgIds(enabled: boolean) {
  const { user } = useUser();
  return useQuery({
    queryKey: ['clerk', 'memberships', user?.id ?? 'none'],
    enabled: enabled && Boolean(user),
    // A membership may be added while the app is open: always ask again.
    staleTime: 0,
    queryFn: async (): Promise<string[]> => {
      if (!user) return [];
      const page = await user.getOrganizationMemberships();
      return page.data.map((m) => m.organization.id);
    },
  });
}
