import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** Caller's user, business and role (owner/staff) from the API. */
export function useMe(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.me,
    queryFn: api.me,
    staleTime: 5 * 60_000,
    enabled: opts.enabled ?? true,
  });
}

/** Hides owner-only controls once the API reports a staff role; the API enforces it regardless. */
export function useCanManage() {
  return useMe().data?.role !== 'staff';
}
