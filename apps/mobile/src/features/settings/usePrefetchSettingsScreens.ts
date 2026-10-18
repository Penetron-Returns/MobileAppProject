import * as React from 'react';
import { InteractionManager } from 'react-native';

import { PLANS_STALE_MS } from '@/features/plans/hooks';
import { api } from '@/lib/api';
import { qk, queryClient } from '@/lib/query';

/**
 * Once Settings has settled, warm the screens one tap away that Settings does
 * not itself read (the Plan page). Team, services, hours and rules are
 * already loaded by the row details.
 */
export function usePrefetchSettingsScreens() {
  React.useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void queryClient.prefetchQuery({
        queryKey: qk.plans,
        queryFn: api.plans,
        staleTime: PLANS_STALE_MS,
      });
    });
    return () => task.cancel();
  }, []);
}
