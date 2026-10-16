import { FloatingTabBar } from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';

import { CompanionEntryDome } from '@/features/companion/components/CompanionEntryDome';
import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';
import { useAppMode } from '@/features/plans/hooks';
import { tabBarActions } from '@/features/plans/tabBar';

type BarProps = React.ComponentProps<typeof FloatingTabBar>;

/**
 * The floating bar wired to the plan: Free keeps "+" and the Inbox dome;
 * paid plans get Reports as a fifth tab and the companion dome. Entitlements come from
 * `/v1/me`, so the bar never shows a dome the plan lacks. On the Today tab the
 * companion dome is hidden: the AI home's own Clovie is the entry there.
 */
export function AppTabBar(props: BarProps) {
  const mode = useAppMode();
  const { tabs, addRoute } = tabBarActions(mode);
  const isToday = props.state.routes[props.state.index]?.name === 'index';
  return (
    <FloatingTabBar
      {...props}
      tabs={tabs}
      centerTab={mode === 'ai' ? 'reports' : undefined}
      onAdd={addRoute ? () => router.push(addRoute as never) : undefined}
      dome={
        mode === 'ai' ? (
          <CompanionEntryDome isHidden={isToday} />
        ) : (
          <InboxEntryDome />
        )
      }
    />
  );
}
