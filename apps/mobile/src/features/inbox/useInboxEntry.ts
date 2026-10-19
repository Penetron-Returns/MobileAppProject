import { useQuery } from '@tanstack/react-query';

import { qk } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export interface InboxEntry {
  /** Open escalations that need a human reply; the badge is hidden at 0. */
  unreadCount: number;
}

async function fetchOpenEscalationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('escalations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');
  if (error) throw error;
  return count ?? 0;
}

/**
 * The only place the Inbox dome's badge is decided: the open-escalation
 * count. The app-wide Realtime channel (`useBusinessRealtime`) keeps it
 * fresh, so there is no polling.
 */
export function useInboxEntry(): InboxEntry {
  const escalations = useQuery({
    queryKey: qk.openEscalations,
    queryFn: fetchOpenEscalationCount,
  });
  return { unreadCount: escalations.data ?? 0 };
}
