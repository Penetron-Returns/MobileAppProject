import { CenteredSpinner, FloatingTabBar } from '@booking/ui';
import { useAuth, useClerk, useSession, useUser } from '@clerk/expo';
import { Redirect, Tabs } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAppointmentsRealtime } from '@/features/appointments/hooks';
import { useMe } from '@/features/business/me';
import { SessionErrorScreen } from '@/features/business/components/SessionErrorScreen';
import { InboxEntryDome } from '@/features/inbox/components/InboxEntryDome';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import {
  resolveAppRoute,
  type MeStatus,
  type SessionTaskKey,
} from '@/features/auth/appRoute';
import { isApiError } from '@/lib/api';

function toMeStatus(
  enabled: boolean,
  me: { isSuccess: boolean; isError: boolean; error: unknown },
): MeStatus {
  if (!enabled) return 'idle';
  if (me.isSuccess) return 'ok';
  if (me.isError) {
    return isApiError(me.error) && me.error.code === 'NO_BUSINESS'
      ? 'no_business'
      : 'error';
  }
  return 'loading';
}

/**
 * Protected group. All routing decisions live in the pure `resolveAppRoute`;
 * this component gathers Clerk/API state, runs the one side effect (activating
 * the first organisation, which also completes a pending
 * `choose-organization` session task) and renders the result.
 *
 * Clerk's org hooks stay unloaded for a `pending` session, so memberships
 * come from the user resource, which loads independently of session status.
 */
export default function AppLayout() {
  const {
    isLoaded: authLoaded,
    isSignedIn,
    orgId,
  } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const { isLoaded: userLoaded, user } = useUser();
  const { session } = useSession();
  const { setActive } = useClerk();
  const { t } = useTranslation();
  const [inOnboarding, setInOnboarding] = React.useState(false);

  const membershipOrgIds = React.useMemo(
    () => (user?.organizationMemberships ?? []).map((m) => m.organization.id),
    [user?.organizationMemberships],
  );
  const hasOrg = Boolean(isSignedIn && orgId);
  const me = useMe({ enabled: hasOrg });
  useAppointmentsRealtime(hasOrg);

  const route = resolveAppRoute({
    authLoaded,
    isSignedIn: Boolean(isSignedIn),
    sessionStatus:
      session?.status === 'pending'
        ? 'pending'
        : session?.status === 'active'
          ? 'active'
          : null,
    taskKey: (session?.currentTask?.key as SessionTaskKey | undefined) ?? null,
    userLoaded,
    activeOrgId: orgId ?? null,
    membershipOrgIds,
    me: toMeStatus(hasOrg, me),
    inOnboarding,
  });

  const activateOrgId = route.kind === 'activate-org' ? route.orgId : null;
  React.useEffect(() => {
    // `navigate` is explicit: routing is driven by this layout, not by Clerk.
    if (activateOrgId) {
      void setActive({ organization: activateOrgId, navigate: async () => {} });
    }
  }, [activateOrgId, setActive]);

  const isOnboarding = route.kind === 'onboarding';
  // Keep onboarding mounted once started, even as the new org makes the route flip.
  React.useEffect(() => {
    if (isOnboarding) setInOnboarding(true);
  }, [isOnboarding]);

  switch (route.kind) {
    case 'splash':
    case 'activate-org':
      return <CenteredSpinner />;
    case 'signed-out':
      return <Redirect href="/sign-in" />;
    case 'onboarding':
      return <OnboardingFlow onDone={() => setInOnboarding(false)} />;
    case 'unsupported-task':
      return (
        <SessionErrorScreen
          error={
            new Error(
              `This account needs an extra step (${route.task}) that the app can't show. Sign out and contact support.`,
            )
          }
          onRetry={() => void session?.reload()}
          isRetrying={false}
        />
      );
    case 'session-error':
      return (
        <SessionErrorScreen
          error={me.error}
          onRetry={() => void me.refetch()}
          isRetrying={me.isFetching}
        />
      );
    case 'tabs':
      break;
  }

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
