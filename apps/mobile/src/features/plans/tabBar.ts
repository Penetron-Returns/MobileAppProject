import type { TabRouteName } from '@booking/ui';

import type { AppMode } from './logic';

export interface TabBarActions {
  /** The tabs, left to right. */
  tabs: readonly TabRouteName[];
  /** Where the centre "+" goes, or null when the bar has none. */
  addRoute: string | null;
}

/**
 * The bar's per-plan layout. Free is the research app: "+" opens New booking
 * (and the Inbox dome shows). Paid plans: Reports is an ordinary fifth tab
 * (and the companion dome shows). Manual booking stays reachable from the
 * Calendar.
 */
export function tabBarActions(mode: AppMode): TabBarActions {
  return mode === 'ai'
    ? {
        tabs: ['index', 'calendar', 'reports', 'clients', 'settings'],
        addRoute: null,
      }
    : {
        tabs: ['index', 'calendar', 'clients', 'settings'],
        addRoute: '/new-booking',
      };
}
