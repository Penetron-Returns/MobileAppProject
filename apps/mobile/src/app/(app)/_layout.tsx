import type { MeDTO } from '@booking/types';
import { useAuth, useClerk, useSession, useUser } from '@clerk/expo';
import { Redirect } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import NetInfo from '@react-native-community/netinfo';

import { ApprovalNotifications } from '@/features/approvals/ApprovalNotifications';
import { CompanionSdkHost } from '@/features/companion/sdk/CompanionSdkHost';
import { ClovieLoading } from '@/features/brand/ClovieLoading';
import { useHideSplashWhen } from '@/features/brand/useHideSplash';
import { ShellEffects } from '@/features/shell/ShellEffects';
import { ShellStack } from '@/features/shell/ShellStack';
import { PushRegistration } from '@/features/notifications/components/PushRegistration';
import { useCompanionSetup } from '@/features/companion/hooks';
import { useMe } from '@/features/business/me';
import { SessionErrorScreen } from '@/features/business/components/SessionErrorScreen';
import { JoinScreen } from '@/features/join/components/JoinScreen';
import { usePendingInvitations } from '@/features/join/hooks';
import { AppUnlockedScreen } from '@/features/onboarding/components/AppUnlockedScreen';
import { useUnlockMoment } from '@/features/onboarding/unlockMoment';
import { ChoosePlanScreen } from '@/features/onboarding/components/ChoosePlanScreen';
import { CompanionSetupScreen } from '@/features/onboarding/components/CompanionSetupScreen';
import { InactiveBusinessScreen } from '@/features/onboarding/components/InactiveBusinessScreen';
import { OnboardingFlow } from '@/features/onboarding/components/OnboardingFlow';
import { ReviseBusinessFlow } from '@/features/onboarding/components/ReviseBusinessFlow';
import { loadBusinessType } from '@/features/onboarding/storage';
import type { BusinessBasics } from '@/features/onboarding/logic';
import { OfflineStartScreen } from '@/features/auth/components/OfflineStartScreen';
import { useMembershipOrgIds } from '@/features/auth/useMemberships';
import { useUserScopedState } from '@/features/auth/useUserScopedState';
import { useBusinessHours } from '@/features/business/hooks';
import {
  basicsStatus,
  isBusinessActive,
  provisioningStatus,
  resolveAppRoute,
  type AppRoute,
  type BillingInput,
  type InvitationsInput,
  type LookupStatus,
  type MeStatus,
  type SessionTaskKey,
} from '@/features/auth/appRoute';
import { isApiError } from '@/lib/api';
import { useIsOnline } from '@/lib/online';

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
 * The plan facts the router needs, from `/v1/me` plus (for the owner of a paid
 * business) Nerova's setup state, which says whether the companion account
 * exists yet. Null until `/v1/me` has loaded.
 */
function useBilling(
  me: MeDTO | undefined,
  hasCachedMe: boolean,
): BillingInput | null {
  const isOwner = me?.role !== 'staff';
  const plan = me?.plan ?? 'none';
  const hasCompanion = Boolean(
    me?.features.some((f) => f.feature === 'companion'),
  );
  const isActive = isBusinessActive({ plan, hasCompanion });
  const setup = useCompanionSetup({
    enabled: Boolean(me) && isOwner && isActive,
  });
  // Only an owner without a plan can still be mid-onboarding.
  const hours = useBusinessHours({
    enabled: Boolean(me) && isOwner && !isActive,
  });
  if (!me) return null;
  const basics =
    isActive || !isOwner || hours.isError
      ? 'complete' // a failed lookup must not trap the owner in onboarding
      : basicsStatus({ name: me.business.name, hours: hours.data });
  return {
    basics,
    plan,
    hasCompanion,
    role: me.role,
    provisioning: provisioningStatus({
      hasCachedMe,
      isOwner,
      isActive,
      setup: {
        isLoading: setup.isPending && setup.fetchStatus !== 'idle',
        nextStep: setup.data?.next_step ?? null,
      },
    }),
  };
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
  // Per-user flags: they reset on sign-out or when another account signs in.
  const userId = isSignedIn ? (user?.id ?? null) : null;
  const isOnline = useIsOnline();
  const [inOnboarding, setInOnboarding] = useUserScopedState(userId, false);
  const [joinDeclined, setJoinDeclined] = useUserScopedState(userId, false);
  const [setupSkipped, setSetupSkipped] = useUserScopedState(userId, false);
  // Back from the plan screen reopens the name and type of the business just created.
  const [revising, setRevising] = useUserScopedState<BusinessBasics | null>(
    userId,
    null,
  );

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
  // Invitations are only used when there is no organisation to open, but asking
  // them alongside the memberships saves a round trip on a fresh sign-in.
  const asksInvitations = asksMemberships;
  const invitations = usePendingInvitations(asksInvitations);
  const me = useMe({ enabled: hasOrg });
  // Sticky: was `me` already in the (restored) cache when the app opened?
  const startedWithMe = React.useRef<boolean | null>(null);
  startedWithMe.current ??= Boolean(me.data);
  const billing = useBilling(me.data, startedWithMe.current);

  const resolved = resolveAppRoute({
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
    billing,
    invitations: toInvitationsInput(asksInvitations, invitations),
    joinDeclined,
    inOnboarding,
  });
  // "Continue to Clovie" on a slow setup: the app opens while Nerova finishes.
  const route: AppRoute =
    resolved.kind === 'companion-setup' && setupSkipped
      ? { kind: 'tabs' }
      : resolved;

  // Paid: "You're all set" shows once, straight from the route change.
  const unlocked = useUnlockMoment(route.kind);

  // Offline, the session and business lookups wait for the network: show that
  // (with Retry) instead of an endless splash.
  const isOfflineStart = route.kind === 'splash' && !isOnline;
  useHideSplashWhen(
    isOfflineStart ||
      (route.kind !== 'splash' && route.kind !== 'activate-org'),
  );

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
  }, [isOnboarding, setInOnboarding]);

  const renderContent = (): React.ReactNode => {
    if (unlocked.isShown) {
      return (
        <AppUnlockedScreen
          businessName={me.data?.business.name ?? ''}
          onContinue={unlocked.dismiss}
        />
      );
    }

    if (isOfflineStart) {
      return (
        <OfflineStartScreen
          onRetry={() => {
            void NetInfo.refresh();
            void session?.reload();
            if (memberships.isError) void memberships.refetch();
            if (me.isError) void me.refetch();
          }}
        />
      );
    }

    switch (route.kind) {
      case 'splash':
      case 'activate-org':
        return <ClovieLoading />;
      case 'signed-out':
        // Signed out: first-run onboarding, which hands over to sign-in after the name.
        return <Redirect href="/onboarding" />;
      case 'join':
        return (
          <JoinScreen
            invitations={invitations.data ?? []}
            onDecline={() => setJoinDeclined(true)}
          />
        );
      case 'onboarding':
        return (
          <OnboardingFlow isSignedIn onDone={() => setInOnboarding(false)} />
        );
      case 'choose-plan':
        return revising ? (
          <ReviseBusinessFlow
            current={revising}
            onDone={() => setRevising(null)}
          />
        ) : (
          <ChoosePlanScreen
            onBack={() =>
              void loadBusinessType().then((typeId) =>
                setRevising({ name: me.data?.business.name ?? '', typeId }),
              )
            }
          />
        );
      case 'inactive-business':
        return <InactiveBusinessScreen />;
      case 'companion-setup':
        return (
          <CompanionSetupScreen onContinue={() => setSetupSkipped(true)} />
        );
      case 'unsupported-task':
        return (
          <SessionErrorScreen
            error={
              new Error(t('session.unsupportedTask', { task: route.task }))
            }
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
        <ApprovalNotifications enabled />
        <PushRegistration enabled />
        <ShellStack />
      </CompanionSdkHost>
    );
  };

  return (
    <>
      <ShellEffects
        routeKind={route.kind}
        hasOrg={hasOrg}
        userId={userId}
        businessId={me.data?.business.id}
      />
      {renderContent()}
    </>
  );
}
