import { FloatingTabBar } from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ClovieTabIcon } from '@/features/clovie-tab/components/ClovieTabIcon';
import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';
import { useAppMode } from '@/features/plans/hooks';
import { tabBarActions } from '@/features/plans/tabBar';

type BarProps = React.ComponentProps<typeof FloatingTabBar>;

/**
 * The floating bar wired to the plan: Free keeps "+" and the Inbox dome;
 * paid plans get Reports as a fifth tab and no dome. Paid plans name the
 * first tab "Clovie" with a clover line icon; that tab's own chat area is the
 * only entry to the companion.
 */
export function AppTabBar(props: BarProps) {
  const { t } = useTranslation();
  const mode = useAppMode();
  const { tabs, addRoute } = tabBarActions(mode);
  return (
    <FloatingTabBar
      {...props}
      tabs={tabs}
      tabLabels={mode === 'ai' ? { index: t('tabs.clovie') } : undefined}
      tabIcons={
        mode === 'ai' ? { index: (p) => <ClovieTabIcon {...p} /> } : undefined
      }
      onAdd={addRoute ? () => router.push(addRoute as never) : undefined}
      dome={mode === 'ai' ? undefined : <InboxEntryDome />}
    />
  );
}
