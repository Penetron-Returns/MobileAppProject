/**
 * Pure routing decision for the protected `(app)` group. No React, no I/O, so
 * every combination of Clerk session state is table-testable. The layout only
 * gathers the inputs and renders the result.
 */

export type SessionStatus = 'active' | 'pending';
/** Clerk session task keys (`session.currentTask.key`). */
export type SessionTaskKey =
  'choose-organization' | 'reset-password' | 'setup-mfa';
export type MeStatus = 'idle' | 'loading' | 'ok' | 'no_business' | 'error';

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
  membershipOrgIds: readonly string[];
  me: MeStatus;
  /** Onboarding stays mounted once started, until the user finishes it. */
  inOnboarding: boolean;
}

export type AppRoute =
  | { kind: 'splash' }
  | { kind: 'signed-out' }
  | { kind: 'activate-org'; orgId: string }
  | { kind: 'onboarding' }
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
    return { kind: 'onboarding' };
  }

  if (input.inOnboarding || input.me === 'no_business')
    return { kind: 'onboarding' };
  if (input.me === 'error') return { kind: 'session-error' };
  if (input.me !== 'ok') return { kind: 'splash' };
  return { kind: 'tabs' };
}
