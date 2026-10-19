import { FloatingTabBar, type TabRouteName } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ClovieTabIcon } from '@/features/clovie-tab/components/ClovieTabIcon';
import { CompanionEntryDome } from '@/features/companion/components/CompanionEntryDome';
import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';
import { useEntitlements } from '@/features/plans/hooks';

type BarProps = React.ComponentProps<typeof FloatingTabBar>;

/** With Clovie the bar has one layout: Reports is an ordinary tab and there is no "+". */
const CLOVIE_TABS: readonly TabRouteName[] = [
  'index',
  'calendar',
  'reports',
  'clients',
  'settings',
];

/** Free has no Clovie tab and no Reports; the Inbox bubble stands in for the companion bubble. */
const FREE_TABS: readonly TabRouteName[] = ['calendar', 'clients', 'settings'];

/**
 * The floating bar. With Clovie the first tab is "Clovie", and the companion
 * bubble (bottom right, still Clovie) is hidden on it, since the tab's own chat
 * area is the entry. Free drops the Clovie tab and shows the Inbox bubble
 * instead. Manual booking stays reachable from the Calendar.
 */
export function AppTabBar(props: BarProps) {
  const { t } = useTranslation();
  const { hasClovie } = useEntitlements();
  if (!hasClovie) {
    return (
      <FloatingTabBar {...props} tabs={FREE_TABS} dome={<InboxEntryDome />} />
    );
  }
  const isClovieTab = props.state.routes[props.state.index]?.name === 'index';
  return (
    <FloatingTabBar
      {...props}
      tabs={CLOVIE_TABS}
      tabLabels={{ index: t('tabs.clovie') }}
      tabIcons={{ index: (p) => <ClovieTabIcon {...p} /> }}
      dome={<CompanionEntryDome isHidden={isClovieTab} />}
    />
  );
}
