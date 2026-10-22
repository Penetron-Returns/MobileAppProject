import { DURATION, useDepth } from '@booking/ui';
import { Tabs } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { AppTabBar } from '@/components/AppTabBar';
import { useIdleReady } from '@/lib/useIdleReady';

// The bar draws itself (icons, labels and the Inbox bubble).
const renderTabBar: React.ComponentProps<typeof Tabs>['tabBar'] = (props) => (
  <AppTabBar {...props} />
);

/**
 * The tab routes (the bar shows five: Dashboard, Calendar, Reports, Clients, Settings). Detail pages (booking, client, settings sub-pages) live in
 * the parent stack so they slide over the tab bar instead of hiding it.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const ground = useDepth().ground.backgroundColor as string;
  // The first tab draws alone; the others mount once the thread is idle, so a
  // tap on them shows a ready screen instead of building it on press.
  const premount = useIdleReady(1000);
  const screenOptions = React.useMemo(
    () => ({
      headerShown: false,
      lazy: !premount,
      // A hidden tab stops re-rendering, so it costs nothing while off screen.
      freezeOnBlur: true,
      // A quick cross-fade between tabs; the scene needs the ground behind it.
      animation: 'fade' as const,
      transitionSpec: {
        animation: 'timing' as const,
        config: { duration: DURATION.quick },
      },
      sceneStyle: { backgroundColor: ground },
    }),
    [ground, premount],
  );
  return (
    <Tabs
      backBehavior="history"
      initialRouteName="index"
      tabBar={renderTabBar}
      screenOptions={screenOptions}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.dashboard') }} />
      <Tabs.Screen name="calendar" options={{ title: t('tabs.calendar') }} />
      <Tabs.Screen name="reports" options={{ title: t('tabs.reports') }} />
      <Tabs.Screen name="clients" options={{ title: t('tabs.clients') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
    </Tabs>
  );
}
