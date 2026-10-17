/**
 * Pure routing decision for the protected `(app)` group. No React, no I/O, so
 * every combination of Clerk session state is table-testable. The layout only
 * gathers the inputs and renders the result.
 */

import type { CompanionSetupStep, MemberRole, PlanKey } from '@booking/types';

export type SessionStatus = 'active' | 'pending';
/** Clerk session task keys (`session.currentTask.key`). */
export type SessionTaskKey =
  'choose-organization' | 'reset-password' | 'setup-mfa';
export type MeStatus =
  | 'idle'
  | 'loading'
  | 'ok'
  | 'no_business'
  /** The API rejected the session (401) or no token could be obtained. */
  | 'unauthorized'
  | 'error';
/** Progress of the lookup of the user's organisation memberships. */
export type LookupStatus = 'idle' | 'loading' | 'ready' | 'error';
/** Pending organisation invitations of the signed-in user. */
export interface InvitationsInput {
  /** `idle` = not asked (the user already has an organisation). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  count: number;
}

export interface BillingInput {
  plan: PlanKey;
  /** The plan carries the companion feature. */
  hasCompanion: boolean;
  role: MemberRole;
  /** Nerova's provisioning of the business's companion account (owners of a paid business only). */
  provisioning: ProvisioningStatus;
}

export type ProvisioningStatus = 'pending' | 'ready';

export interface AppRouteInput {
  authLoaded: boolean;
  isSignedIn: boolean;
  /** Null until Clerk reports a session. */
  sessionStatus: SessionStatus | null;
  /** The pending session's task, if any. */
  taskKey: SessionTaskKey | null;
  /** True once the Clerk user (and its memberships) have loaded. */
  userLoaded: boolean;
  activeOrgId: string | null;
  /**
   * Organisation ids of the user. Clerk's cached list is empty right after a
   * fresh sign-in, so the layout fetches it when nothing is cached.
   */
  membershipOrgIds: readonly string[];
  /** `idle` = not asked (an organisation is active or ids were cached). */
  membershipsStatus: LookupStatus;
  me: MeStatus;
  /** What `/v1/me` says about the business's plan; null until it has loaded. */
  billing: BillingInput | null;
  /** Pending invitations, asked only while the user has no organisation. */
  invitations: InvitationsInput;
  /** The person chose "Create my own business instead" on the join screen. */
  joinDeclined: boolean;
  /** Onboarding stays mounted once started, until the user finishes it. */
  inOnboarding: boolean;
}

export type AppRoute =
  | { kind: 'splash' }
  | { kind: 'signed-out' }
  | { kind: 'activate-org'; orgId: string }
  | { kind: 'join' }
  | { kind: 'onboarding' }
  /** The business exists but has no active plan: the owner chooses one. */
  | { kind: 'choose-plan' }
  /** A member who is not the owner of a business with no active plan. */
  | { kind: 'inactive-business' }
  /** Paid, and Nerova is still creating the companion account. */
  | { kind: 'companion-setup' }
  | { kind: 'unsupported-task'; task: SessionTaskKey }
  | { kind: 'session-error' }
  | { kind: 'tabs' };

export function resolveAppRoute(input: AppRouteInput): AppRoute {
  if (!input.authLoaded) return { kind: 'splash' };
  if (!input.isSignedIn) return { kind: 'signed-out' };
  if (!input.userLoaded) return { kind: 'splash' };

  // Tasks other than choosing an organisation need Clerk UI we do not ship
  // (accounts are issued), so say so instead of spinning.
  if (input.taskKey && input.taskKey !== 'choose-organization') {
    return { kind: 'unsupported-task', task: input.taskKey };
  }

  if (!input.activeOrgId) {
    const first = input.membershipOrgIds[0];
    if (first) return { kind: 'activate-org', orgId: first };
    // Never decide "no business" until the memberships are actually known: an
    // unanswered or failed lookup is not an empty one.
    if (input.membershipsStatus === 'loading') return { kind: 'splash' };
    if (input.membershipsStatus === 'error') return { kind: 'session-error' };
    // Someone invited to a business joins it before creating their own. A
    // failed lookup falls through to onboarding: it needs an explicit action,
    // and blocking here would strand a user who has no invitation.
    if (input.invitations.status === 'loading') return { kind: 'splash' };
    if (
      input.invitations.status === 'ready' &&
      input.invitations.count > 0 &&
      !input.joinDeclined
    ) {
      return { kind: 'join' };
    }
    return { kind: 'onboarding' };
  }

  if (input.inOnboarding || input.me === 'no_business')
    return { kind: 'onboarding' };
  if (input.me === 'error' || input.me === 'unauthorized')
    return { kind: 'session-error' };
  if (input.me !== 'ok' || !input.billing) return { kind: 'splash' };
  return resolveBilling(input.billing);
}

/** Paid plans (or anything carrying the companion) are active; `none` and `free` are not. */
export function isBusinessActive(
  billing: Pick<BillingInput, 'plan' | 'hasCompanion'>,
): boolean {
  return (
    billing.hasCompanion || (billing.plan !== 'none' && billing.plan !== 'free')
  );
}

function resolveBilling(billing: BillingInput): AppRoute {
  const isOwner = billing.role !== 'staff';
  if (!isBusinessActive(billing)) {
    return { kind: isOwner ? 'choose-plan' : 'inactive-business' };
  }
  if (isOwner && billing.provisioning === 'pending') {
    return { kind: 'companion-setup' };
  }
  return { kind: 'tabs' };
}

/**
 * Whether Nerova has finished creating the owner's companion account. Only
 * `provision_account` blocks the app: any other step, or a failed or unavailable
 * lookup, must not lock an owner out of their own business.
 */
export function provisioningStatus(input: {
  isOwner: boolean;
  isActive: boolean;
  setup: { isLoading: boolean; nextStep: CompanionSetupStep | null };
}): ProvisioningStatus {
  if (!input.isOwner || !input.isActive) return 'ready';
  if (input.setup.isLoading) return 'pending';
  return input.setup.nextStep === 'provision_account' ? 'pending' : 'ready';
}
