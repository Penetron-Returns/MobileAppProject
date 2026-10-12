import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { supabase } from '@/lib/supabase';

/** Refetches every appointment-derived query when an appointment changes. */
export function useAppointmentsRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void queryClient.invalidateQueries({ queryKey: qk.appointments });
          void queryClient.invalidateQueries({ queryKey: qk.dashboardAll });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

export function useCheckInAppointment(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.checkInAppointment(id, key),
    invalidate: [qk.appointments, qk.dashboardAll],
    onSuccess: opts.onSuccess,
  });
}
