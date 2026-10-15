import { DURATION, FloatingTabBar, useDepth } from '@booking/ui';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';

/**
 * The five tabs. Detail pages (booking, client, settings sub-pages) live in
 * the parent stack so they slide over the tab bar instead of hiding it.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const ground = useDepth().ground.backgroundColor as string;
  return (
    <Tabs
      backBehavior="history"
      // The floating capsule draws itself (icons, labels and the centre "+").
      tabBar={(props) => (
        <FloatingTabBar {...props} inbox={<InboxEntryDome />} />
      )}
      screenOptions={{
        headerShown: false,
        // A quick cross-fade between tabs; the scene needs the ground behind it.
        animation: 'fade',
        transitionSpec: {
          animation: 'timing',
          config: { duration: DURATION.quick },
        },
        sceneStyle: { backgroundColor: ground },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.today') }} />
      <Tabs.Screen name="calendar" options={{ title: t('tabs.calendar') }} />
      <Tabs.Screen name="add" options={{ title: t('tabs.add') }} />
      <Tabs.Screen name="clients" options={{ title: t('tabs.clients') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
    </Tabs>
  );
}
