import * as React from 'react';

import { analytics } from '@/features/analytics';
import { useAnalyticsIdentity } from '@/features/analytics/useAnalyticsIdentity';
import { useAttendanceNotifications } from '@/features/attendance/notifications';
import type { AppRoute } from '@/features/auth/appRoute';
import { nextFunnelState } from '@/features/onboarding/funnel';
import {
  clearDraft,
  clearOnboardingStorage,
} from '@/features/onboarding/storage';
import { useEntitlements } from '@/features/plans/hooks';
import { useBusinessRealtime } from '@/features/realtime/useBusinessRealtime';
import { useVoiceDeviceToken } from '@/features/voice/deviceToken';
import { useVoiceScheduleSync } from '@/features/voice/scheduleSync';

interface ShellEffectsProps {
  routeKind: AppRoute['kind'];
  /** Signed in with an active business. */
  hasOrg: boolean;
  /** Clovie is part of the plan; Free has no voice or companion work to run. */
  hasClovie: boolean;
  /** The Clerk user while signed in, else null. */
  userId: string | null;
  businessId: string | undefined;
}

/**
 * The shell's side effects, in one component that renders nothing. They live
 * here, not in the layout, so a change in entitlements or analytics identity
 * re-renders this empty component instead of the whole navigator.
 */
export function ShellEffects({
  routeKind,
  hasOrg,
  hasClovie,
  userId,
  businessId,
}: ShellEffectsProps) {
  useAnalyticsIdentity(userId, businessId);
  useBusinessRealtime(hasOrg, useEntitlements().has('inbox'));
  useVoiceScheduleSync(hasOrg && hasClovie);

  // Once the business exists, the draft and the remembered type are spent. Back
  // from the plan screen still needs the type, so only the draft goes there.
  React.useEffect(() => {
    if (routeKind === 'choose-plan') void clearDraft();
    if (routeKind === 'tabs' || routeKind === 'companion-setup') {
      void clearOnboardingStorage();
    }
  }, [routeKind]);

  // First run is done when the tabs appear after the onboarding, plan or setup screens.
  const sawFirstRun = React.useRef(false);
  React.useEffect(() => {
    const next = nextFunnelState(sawFirstRun.current, routeKind);
    sawFirstRun.current = next.hasSeenFirstRun;
    if (next.isCompleted) analytics.track('onboarding_completed');
  }, [routeKind]);

  // Taps on attendance pushes navigate, so wait until the tabs are on screen.
  useAttendanceNotifications(routeKind === 'tabs');
  // Background voice and notification actions run without a live session: keep their device token fresh.
  useVoiceDeviceToken(routeKind === 'tabs' && hasClovie);
  return null;
}
