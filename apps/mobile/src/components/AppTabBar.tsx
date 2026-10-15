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
 * paid plans get Reports and the companion dome. Entitlements come from
 * `/v1/me`, so the bar never shows a dome the plan lacks.
 */
export function AppTabBar(props: BarProps) {
  const mode = useAppMode();
  const { center, centerRoute } = tabBarActions(mode);
  return (
    <FloatingTabBar
      {...props}
      center={center}
      onCenter={() => router.push(centerRoute as never)}
      dome={mode === 'ai' ? <CompanionEntryDome /> : <InboxEntryDome />}
    />
  );
}
