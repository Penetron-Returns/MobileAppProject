import type { AppRoute } from '@/features/auth/appRoute';

/** Routes that belong to first-run: the questions. */
const FIRST_RUN: ReadonlySet<AppRoute['kind']> = new Set(['onboarding']);

/**
 * Onboarding is complete when the app reaches the tabs after having been on a
 * first-run route. Pure so the funnel rule is table-testable: feed it each
 * route kind in order and it says when to fire `onboarding_completed`.
 */
export function nextFunnelState(
  hasSeenFirstRun: boolean,
  kind: AppRoute['kind'],
): { hasSeenFirstRun: boolean; isCompleted: boolean } {
  if (FIRST_RUN.has(kind)) return { hasSeenFirstRun: true, isCompleted: false };
  if (kind === 'tabs' && hasSeenFirstRun) {
    return { hasSeenFirstRun: false, isCompleted: true };
  }
  return { hasSeenFirstRun, isCompleted: false };
}
