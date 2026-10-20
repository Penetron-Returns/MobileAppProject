import { FloatingTabBar, type TabRouteName } from '@booking/ui';
import * as React from 'react';

import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';

type BarProps = React.ComponentProps<typeof FloatingTabBar>;

const TABS: readonly TabRouteName[] = [
  'calendar',
  'reports',
  'clients',
  'settings',
];

/**
 * The floating bar: Calendar, Reports, Clients and Settings, with the Inbox
 * bubble above the right-hand end. Manual booking stays reachable from the
 * Calendar.
 */
export function AppTabBar(props: BarProps) {
  return <FloatingTabBar {...props} tabs={TABS} dome={<InboxEntryDome />} />;
}
