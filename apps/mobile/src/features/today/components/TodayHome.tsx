import { Ground } from '@booking/ui';
import * as React from 'react';

import { ClovieTabScreen } from '@/features/clovie-tab/components/ClovieTabScreen';
import { useEntitlements } from '@/features/plans/hooks';

/**
 * The first tab is always the Clovie tab: every plan has the companion. While
 * the plan is loading it shows the bare ground rather than flashing the chat.
 */
export function TodayHome() {
  const entitlements = useEntitlements();
  if (entitlements.isLoading) return <Ground className="flex-1" />;
  return <ClovieTabScreen />;
}
