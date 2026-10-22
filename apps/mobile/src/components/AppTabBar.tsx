import {
  FloatingTabBar,
  type TabIconProps,
  type TabRouteName,
} from '@booking/ui';
import { LayoutDashboard } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';

type BarProps = React.ComponentProps<typeof FloatingTabBar>;

const TABS: readonly TabRouteName[] = [
  'index',
  'calendar',
  'reports',
  'clients',
  'settings',
];

const renderDashboardIcon = ({ size, strokeWidth, color }: TabIconProps) => (
  <LayoutDashboard size={size} strokeWidth={strokeWidth} color={color} />
);

const TAB_ICONS = { index: renderDashboardIcon };

/**
 * The floating bar: Dashboard, Calendar, Reports, Clients and Settings, with the Inbox
 * bubble above the right-hand end. Manual booking stays reachable from the
 * Calendar.
 */
export function AppTabBar(props: BarProps) {
  const { t } = useTranslation();
  return (
    <FloatingTabBar
      {...props}
      tabs={TABS}
      tabLabels={{ index: t('tabs.dashboard') }}
      tabIcons={TAB_ICONS}
      dome={<InboxEntryDome />}
    />
  );
}
