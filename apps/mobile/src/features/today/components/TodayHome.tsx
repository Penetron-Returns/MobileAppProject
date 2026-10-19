import { Ground } from '@booking/ui';
import { Redirect } from 'expo-router';
import * as React from 'react';

import { ClovieTabScreen } from '@/features/clovie-tab/components/ClovieTabScreen';
import { useEntitlements } from '@/features/plans/hooks';

/**
 * The first tab is the Clovie tab when the plan has Clovie; Free has no such
 * tab and opens on the Calendar. While the plan is loading it shows the bare
 * ground rather than flashing the chat.
 */
export function TodayHome() {
  const entitlements = useEntitlements();
  if (entitlements.isLoading) return <Ground className="flex-1" />;
  if (!entitlements.hasClovie) return <Redirect href="/calendar" />;
  return <ClovieTabScreen />;
}
