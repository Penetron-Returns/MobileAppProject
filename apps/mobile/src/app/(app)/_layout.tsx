import { useAuth, useOrganization, useOrganizationList } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import {
  CalendarDays,
  LayoutDashboard,
  PlusCircle,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react-native';
import * as React from 'react';

import { NoBusinessScreen } from '@/components/NoBusinessScreen';
import { CenteredSpinner } from '@/components/States';
import { useAppointmentsRealtime } from '@/features/appointments/hooks';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';

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
  const { colors } = useAppColorScheme();
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
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, size }) => (
            <PlusCircle color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <SettingsIcon color={color} size={size} />
          ),
        }}
      />
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
