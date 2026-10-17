import { Ground } from '@booking/ui';
import * as React from 'react';

import { ClovieTabScreen } from '@/features/clovie-tab/components/ClovieTabScreen';
import { useEntitlements } from '@/features/plans/hooks';

import { TodayScreen } from './TodayScreen';

/**
 * The first tab: the Clovie tab for plans with the companion, the classic Today
 * for everyone else. While the plan is loading it shows the bare ground, so
 * Free owners never see the AI home flash up (or the reverse).
 */
export function TodayHome() {
  const entitlements = useEntitlements();
  if (entitlements.isLoading) return <Ground className="flex-1" />;
  return entitlements.has('companion') ? <ClovieTabScreen /> : <TodayScreen />;
}
