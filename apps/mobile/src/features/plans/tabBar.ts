import type { CenterAction } from '@booking/ui';

import type { AppMode } from './logic';

export interface TabBarActions {
  /** The middle button of the bar. */
  center: CenterAction;
  /** Where the middle button goes. */
  centerRoute: string;
}

/**
 * The bar's per-plan actions. Free is the research app: "+" opens New
 * booking (and the Inbox dome shows). Paid plans: Reports (and the companion
 * dome). Manual booking stays reachable from the Calendar.
 */
export function tabBarActions(mode: AppMode): TabBarActions {
  return mode === 'ai'
    ? { center: 'reports', centerRoute: '/reports' }
    : { center: 'add', centerRoute: '/new-booking' };
}
