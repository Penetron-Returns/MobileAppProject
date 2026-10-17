import { FloatingTabBar, type TabRouteName } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ClovieTabIcon } from '@/features/clovie-tab/components/ClovieTabIcon';
import { CompanionEntryDome } from '@/features/companion/components/CompanionEntryDome';

type BarProps = React.ComponentProps<typeof FloatingTabBar>;

/** Every plan is paid, so the bar has one layout: Reports is an ordinary tab and there is no "+". */
const TABS: readonly TabRouteName[] = [
  'index',
  'calendar',
  'reports',
  'clients',
  'settings',
];

/**
 * The floating bar: the first tab is "Clovie", and the companion bubble
 * (bottom right, still Clovie) is hidden on it, since the tab's own chat area
 * is the entry. Manual booking stays reachable from the Calendar.
 */
export function AppTabBar(props: BarProps) {
  const { t } = useTranslation();
  const isClovieTab = props.state.routes[props.state.index]?.name === 'index';
  return (
    <FloatingTabBar
      {...props}
      tabs={TABS}
      tabLabels={{ index: t('tabs.clovie') }}
      tabIcons={{ index: (p) => <ClovieTabIcon {...p} /> }}
      dome={<CompanionEntryDome isHidden={isClovieTab} />}
    />
  );
}
