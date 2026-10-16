import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

import {
  keysToInvalidate,
  realtimeTables,
  shouldListen,
  type RealtimeTable,
} from './tables';

/**
 * The app's single Realtime channel (RLS scopes the rows to the business):
 * bookings, attendance and, with an inbox plan, conversations. It only exists
 * while the app is in the foreground, so a backgrounded app holds no socket
 * traffic; coming back re-subscribes and refreshes everything once. This also
 * replaces polling: nothing needs a refetch timer while the channel is live.
 */
export function useBusinessRealtime(isEnabled: boolean, hasInbox: boolean) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!isEnabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const open = () => {
      if (channel) return;
      let next = supabase.channel('business-changes');
      for (const table of realtimeTables(hasInbox)) {
        next = next.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => invalidate(table),
        );
      }
      next.subscribe();
      channel = next;
    };
    const invalidate = (table: RealtimeTable) => {
      for (const queryKey of keysToInvalidate(table)) {
        void queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    };
    const close = () => {
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
    };
    const sync = (state: string) => {
      if (shouldListen(true, state)) {
        const wasClosed = channel === null;
        open();
        // Changes made while backgrounded were missed: refresh once.
        if (wasClosed && state === 'active') {
          for (const table of realtimeTables(hasInbox)) invalidate(table);
        }
      } else {
        close();
      }
    };
    open();
    const sub = AppState.addEventListener('change', sync);
    return () => {
      sub.remove();
      close();
    };
  }, [isEnabled, hasInbox, queryClient]);
}
