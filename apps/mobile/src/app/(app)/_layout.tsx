import { CenteredSpinner, FloatingTabBar } from '@booking/ui';
import { useAuth, useOrganization, useOrganizationList } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAppointmentsRealtime } from '@/features/appointments/hooks';
import { useMe } from '@/features/business/me';
import { SessionErrorScreen } from '@/features/business/components/SessionErrorScreen';
import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { isApiError } from '@/lib/api';

/**
 * Protected group: requires a signed-in user AND an active Clerk
 * organisation (a business). Activates the first membership automatically
 * when the session has none active yet. A user with no organisation, or whose
 * organisation has no business row yet, goes through in-app onboarding (which
 * stays on screen until the user taps "Go to Today").
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
  const me = useMe({ enabled: Boolean(isSignedIn && organization) });
  const [inOnboarding, setInOnboarding] = React.useState(false);

  const memberships = userMemberships.data;
  const hasNoMemberships = listLoaded && (memberships?.length ?? 0) === 0;
  const isReady = authLoaded && isSignedIn && orgLoaded && listLoaded;
  const shouldActivateFirst = Boolean(
    isReady && !organization && memberships && memberships.length > 0,
  );

  React.useEffect(() => {
    if (shouldActivateFirst && memberships) {
      void setActive?.({ organization: memberships[0].organization.id });
    }
  }, [shouldActivateFirst, memberships, setActive]);

  const businessMissing =
    isApiError(me.error) && me.error.code === 'NO_BUSINESS';
  const needsOnboarding =
    authLoaded &&
    !!isSignedIn &&
    listLoaded &&
    ((!organization && hasNoMemberships) ||
      (!!organization && businessMissing));
  // Keep onboarding mounted once started, even as the new org makes needsOnboarding false.
  React.useEffect(() => {
    if (needsOnboarding) setInOnboarding(true);
  }, [needsOnboarding]);

  if (!authLoaded) return <CenteredSpinner />;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!orgLoaded || !listLoaded) return <CenteredSpinner />;
  if (inOnboarding || needsOnboarding) {
    return <OnboardingFlow onDone={() => setInOnboarding(false)} />;
  }
  if (me.isError) {
    return (
      <SessionErrorScreen
        error={me.error}
        onRetry={() => void me.refetch()}
        isRetrying={me.isFetching}
      />
    );
  }
  if (!organization || me.isPending) return <CenteredSpinner />;

  return (
    <Tabs
      // Detail pages are hidden tabs, so back must follow history, not jump to the first tab.
      backBehavior="history"
      // The floating capsule draws itself (icons, labels and the centre "+").
      tabBar={(props) => (
        <FloatingTabBar {...props} inbox={<InboxEntryDome />} />
      )}
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
        name="bookings/reschedule/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="bookings/cancel/[id]"
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
        name="settings/staff-management"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="inbox/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/booking-rules"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/whatsapp"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/whatsapp-detail"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="settings/notifications"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
