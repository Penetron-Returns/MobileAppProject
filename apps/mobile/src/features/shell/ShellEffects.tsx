import * as React from 'react';

import { analytics } from '@/features/analytics';
import { useAnalyticsIdentity } from '@/features/analytics/useAnalyticsIdentity';
import { useAttendanceNotifications } from '@/features/attendance/notifications';
import type { AppRoute } from '@/features/auth/appRoute';
import { nextFunnelState } from '@/features/onboarding/funnel';
import { clearOnboardingStorage } from '@/features/onboarding/storage';
import { useBusinessRealtime } from '@/features/realtime/useBusinessRealtime';

interface ShellEffectsProps {
  routeKind: AppRoute['kind'];
  /** Signed in with an active business. */
  hasOrg: boolean;
  /** The Clerk user while signed in, else null. */
  userId: string | null;
  businessId: string | undefined;
}

/**
 * The shell's side effects, in one component that renders nothing. They live
 * here, not in the layout, so a change in analytics identity
 * re-renders this empty component instead of the whole navigator.
 */
export function ShellEffects({
  routeKind,
  hasOrg,
  userId,
  businessId,
}: ShellEffectsProps) {
  useAnalyticsIdentity(userId, businessId);
  useBusinessRealtime(hasOrg);

  // Once the business exists, the onboarding draft and the remembered type are spent.
  React.useEffect(() => {
    if (routeKind === 'tabs') void clearOnboardingStorage();
  }, [routeKind]);

  // First run is done when the tabs appear after the onboarding.
  const sawFirstRun = React.useRef(false);
  React.useEffect(() => {
    const next = nextFunnelState(sawFirstRun.current, routeKind);
    sawFirstRun.current = next.hasSeenFirstRun;
    if (next.isCompleted) analytics.track('onboarding_completed');
  }, [routeKind]);

  // Taps on attendance pushes navigate, so wait until the tabs are on screen.
  useAttendanceNotifications(routeKind === 'tabs');
  return null;
}
