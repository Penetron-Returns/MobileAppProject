import { DURATION, useDepth } from '@booking/ui';
import { useAuth, useClerk, useSession, useUser } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { CompanionSdkHost } from '@/features/companion/sdk/CompanionSdkHost';
import { ClovieLoading } from '@/features/brand/ClovieLoading';
import { useHideSplashWhen } from '@/features/brand/useHideSplash';
import { useAttendanceRealtime } from '@/features/attendance/hooks';
import { useAttendanceNotifications } from '@/features/attendance/notifications';
import { useAppointmentsRealtime } from '@/features/appointments/hooks';
import { useMe } from '@/features/business/me';
import { SessionErrorScreen } from '@/features/business/components/SessionErrorScreen';
import { JoinScreen } from '@/features/join/components/JoinScreen';
import { usePendingInvitations } from '@/features/join/hooks';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { useMembershipOrgIds } from '@/features/auth/useMemberships';
import {
  resolveAppRoute,
  type InvitationsInput,
  type LookupStatus,
  type MeStatus,
  type SessionTaskKey,
} from '@/features/auth/appRoute';
import { useVoiceScheduleSync } from '@/features/voice/scheduleSync';
import { isApiError } from '@/lib/api';

function toInvitationsInput(
  enabled: boolean,
  query: { isSuccess: boolean; isError: boolean; data?: readonly unknown[] },
): InvitationsInput {
  if (!enabled) return { status: 'idle', count: 0 };
  if (query.isSuccess)
    return { status: 'ready', count: query.data?.length ?? 0 };
  return { status: query.isError ? 'error' : 'loading', count: 0 };
}

function toLookupStatus(
  enabled: boolean,
  query: { isSuccess: boolean; isError: boolean },
): LookupStatus {
  if (!enabled) return 'idle';
  if (query.isSuccess) return 'ready';
  return query.isError ? 'error' : 'loading';
}

/** A rejected session (401) or a missing token is not "no business". */
function isUnauthorized(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.status === 401 || error.code === 'NOT_SIGNED_IN')
  );
}

function toMeStatus(
  enabled: boolean,
  me: { isSuccess: boolean; isError: boolean; error: unknown },
): MeStatus {
  if (!enabled) return 'idle';
  if (me.isSuccess) return 'ok';
  if (me.isError) {
    if (isUnauthorized(me.error)) return 'unauthorized';
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
  const ground = useDepth().ground.backgroundColor as string;
  const [inOnboarding, setInOnboarding] = React.useState(false);
  const [joinDeclined, setJoinDeclined] = React.useState(false);

  const cachedOrgIds = React.useMemo(
    () => (user?.organizationMemberships ?? []).map((m) => m.organization.id),
    [user?.organizationMemberships],
  );
  const hasOrg = Boolean(isSignedIn && orgId);
  // Clerk's cached memberships are empty right after a fresh sign-in, so with
  // no active org and nothing cached, ask Clerk before deciding anything.
  const asksMemberships = Boolean(
    isSignedIn && userLoaded && !orgId && cachedOrgIds.length === 0,
  );
  const memberships = useMembershipOrgIds(asksMemberships);
  const membershipOrgIds = cachedOrgIds.length
    ? cachedOrgIds
    : (memberships.data ?? cachedOrgIds);
  // Invitations only matter to someone proven to have no organisation to open.
  const asksInvitations = Boolean(
    asksMemberships && memberships.isSuccess && membershipOrgIds.length === 0,
  );
  const invitations = usePendingInvitations(asksInvitations);
  const me = useMe({ enabled: hasOrg });
  useAppointmentsRealtime(hasOrg);
  useAttendanceRealtime(hasOrg);
  useVoiceScheduleSync(hasOrg);

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
    membershipsStatus: toLookupStatus(asksMemberships, memberships),
    me: toMeStatus(hasOrg, me),
    invitations: toInvitationsInput(asksInvitations, invitations),
    joinDeclined,
    inOnboarding,
  });

  // Taps on attendance pushes navigate, so wait until the tabs are on screen.
  useAttendanceNotifications(route.kind === 'tabs');

  useHideSplashWhen(route.kind !== 'splash' && route.kind !== 'activate-org');

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
      return <ClovieLoading />;
    case 'signed-out':
      return <Redirect href="/sign-in" />;
    case 'join':
      return (
        <JoinScreen
          invitations={invitations.data ?? []}
          onDecline={() => setJoinDeclined(true)}
        />
      );
    case 'onboarding':
      return <OnboardingFlow onDone={() => setInOnboarding(false)} />;
    case 'unsupported-task':
      return (
        <SessionErrorScreen
          error={new Error(t('session.unsupportedTask', { task: route.task }))}
          onRetry={() => void session?.reload()}
          isRetrying={false}
        />
      );
    case 'session-error':
      return (
        <SessionErrorScreen
          error={memberships.error ?? me.error}
          onRetry={() =>
            void (memberships.isError ? memberships.refetch() : me.refetch())
          }
          isRetrying={memberships.isFetching || me.isFetching}
        />
      );
    case 'tabs':
      break;
  }

  return (
    <CompanionSdkHost>
      <Stack
        screenOptions={{
          headerShown: false,
          // Drill-in pages slide in from the right and swipe back natively.
          animation: 'slide_from_right',
          animationDuration: DURATION.page,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          // The ground colour behind a moving screen, so a transition never flashes white.
          contentStyle: { backgroundColor: ground },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
        {/* New booking slides up over everything, tab bar included. Swipe-down is
          off so closing always goes through the discard check. */}
        <Stack.Screen
          name="new-booking"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
            animationDuration: DURATION.page,
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        {/* The companion sheet draws its own dim and slides itself in. */}
        <Stack.Screen
          name="companion"
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack>
    </CompanionSdkHost>
  );
}
