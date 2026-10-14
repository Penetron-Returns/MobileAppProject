import { useAuth, useOrganization, useOrganizationList } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { NoBusinessScreen } from '@/components/NoBusinessScreen';
import { CenteredSpinner } from '@/components/States';
import { FloatingTabBar } from '@/components/tab-bar/FloatingTabBar';
import { useAppointmentsRealtime } from '@/features/appointments/hooks';

/**
 * Protected group: requires a signed-in user AND an active Clerk
 * organisation (a business). Activates the first membership automatically
 * when the session has none active yet; a user with zero memberships sees
 * `NoBusinessScreen` instead of the tabs.
 */
export default function AppLayout() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const {
    isLoaded: listLoaded,
    userMemberships,
    setActive,
  } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const { t } = useTranslation();
  useAppointmentsRealtime(Boolean(isSignedIn && organization));

  const memberships = userMemberships.data;
  const hasNoMemberships = listLoaded && (memberships?.length ?? 0) === 0;
  const shouldActivateFirst = Boolean(
    authLoaded &&
    isSignedIn &&
    orgLoaded &&
    listLoaded &&
    !organization &&
    memberships &&
    memberships.length > 0,
  );

  React.useEffect(() => {
    if (shouldActivateFirst && memberships) {
      void setActive?.({ organization: memberships[0].organization.id });
    }
  }, [shouldActivateFirst, memberships, setActive]);

  if (!authLoaded) return <CenteredSpinner />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!orgLoaded || !listLoaded) return <CenteredSpinner />;
  if (!organization && hasNoMemberships) return <NoBusinessScreen />;
  if (!organization) return <CenteredSpinner />;

  return (
    <Tabs
      // Detail pages are hidden tabs, so back must follow history, not jump to the first tab.
      backBehavior="history"
      // The floating capsule draws itself (icons, labels and the centre "+").
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.today') }} />
      <Tabs.Screen name="calendar" options={{ title: t('tabs.calendar') }} />
      <Tabs.Screen name="add" options={{ title: t('tabs.add') }} />
      <Tabs.Screen name="clients" options={{ title: t('tabs.clients') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings') }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
      <Tabs.Screen
        name="bookings/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="clients/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/operating-hours"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/services"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/business-details"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/staff"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/staff-management"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
