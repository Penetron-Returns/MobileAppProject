import { CenteredSpinner, DURATION, useDepth } from '@booking/ui';
import { useAuth, useClerk, useSession, useUser } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useAppointmentsRealtime } from '@/features/appointments/hooks';
import { useMe } from '@/features/business/me';
import { SessionErrorScreen } from '@/features/business/components/SessionErrorScreen';
import { JoinScreen } from '@/features/join/components/JoinScreen';
import { usePendingInvitations } from '@/features/join/hooks';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import {
  resolveAppRoute,
  type InvitationsInput,
  type MeStatus,
  type SessionTaskKey,
} from '@/features/auth/appRoute';
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
  const ground = useDepth().ground.backgroundColor as string;
  const [inOnboarding, setInOnboarding] = React.useState(false);
  const [joinDeclined, setJoinDeclined] = React.useState(false);

  const membershipOrgIds = React.useMemo(
    () => (user?.organizationMemberships ?? []).map((m) => m.organization.id),
    [user?.organizationMemberships],
  );
  const hasOrg = Boolean(isSignedIn && orgId);
  // Invitations only matter to someone with no organisation to open.
  const asksInvitations = Boolean(
    isSignedIn && userLoaded && !orgId && membershipOrgIds.length === 0,
  );
  const invitations = usePendingInvitations(asksInvitations);
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
    invitations: toInvitationsInput(asksInvitations, invitations),
    joinDeclined,
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
          error={me.error}
          onRetry={() => void me.refetch()}
          isRetrying={me.isFetching}
        />
      );
    case 'tabs':
      break;
  }

  return (
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
    </Stack>
  );
}
