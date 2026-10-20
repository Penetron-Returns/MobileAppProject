import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { AppState } from 'react-native';

import { isOwnEchoLikely } from '@/lib/ownMutations';
import { supabase } from '@/lib/supabase';

import { createKeyedDebouncer } from './debounce';
import {
  isEchoCandidate,
  keysToInvalidate,
  realtimeTables,
  REALTIME_DEBOUNCE_MS,
  shouldListen,
  type RealtimeTable,
} from './tables';

/**
 * The app's single Realtime channel (RLS scopes the rows to the business):
 * bookings, attendance and conversations. It only exists
 * while the app is in the foreground, so a backgrounded app holds no socket
 * traffic. Events are coalesced per table, echoes of this device's own writes
 * are skipped, and only mounted screens refetch. Coming back to the foreground
 * is handled by TanStack's focusManager (stale queries refetch), so there is no
 * second refresh here. This also replaces polling.
 */
export function useBusinessRealtime(isEnabled: boolean) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!isEnabled) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const refresh = (table: RealtimeTable) => {
      for (const { key, refetchType } of keysToInvalidate(table)) {
        void queryClient.invalidateQueries({
          queryKey: [...key],
          refetchType,
        });
      }
    };
    const debouncer = createKeyedDebouncer(refresh, REALTIME_DEBOUNCE_MS);
    const onChange = (table: RealtimeTable) => {
      if (isEchoCandidate(table) && isOwnEchoLikely()) return;
      debouncer.schedule(table);
    };
    const open = () => {
      if (channel) return;
      let next = supabase.channel('business-changes');
      for (const table of realtimeTables(true)) {
        next = next.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => onChange(table),
        );
      }
      next.subscribe();
      channel = next;
    };
    const close = () => {
      debouncer.cancelAll();
      if (!channel) return;
      void supabase.removeChannel(channel);
      channel = null;
    };
    const sync = (state: string) => {
      if (shouldListen(true, state)) open();
      else close();
    };
    open();
    const sub = AppState.addEventListener('change', sync);
    return () => {
      sub.remove();
      close();
    };
  }, [isEnabled, queryClient]);
}
