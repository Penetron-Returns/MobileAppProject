import { useQuery } from '@tanstack/react-query';

import { useEntitlements } from '@/features/plans/hooks';
import { qk } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export interface InboxEntry {
  /** Whether the floating Inbox dome is shown above the tab bar. */
  isVisible: boolean;
  /** Open escalations that need a human reply; the badge is hidden at 0. */
  unreadCount: number;
}

const POLL_MS = 60_000;

async function fetchOpenEscalationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('escalations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) throw error;
  return count ?? 0;
}

/**
 * The only place the Inbox dome's visibility and badge are decided.
 * Visible only when the plan includes `inbox` (entitlements fail closed, so
 * it stays hidden while loading). The badge is the open-escalation count; the
 * query is skipped entirely when the dome is hidden.
 */
export function useInboxEntry(): InboxEntry {
  const isVisible = useEntitlements().has('inbox');
  const escalations = useQuery({
    queryKey: qk.openEscalations,
    queryFn: fetchOpenEscalationCount,
    enabled: isVisible,
    refetchInterval: POLL_MS,
  });
  return { isVisible, unreadCount: isVisible ? (escalations.data ?? 0) : 0 };
}
