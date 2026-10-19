import * as React from 'react';
import { AppState, Platform } from 'react-native';

import {
  useBusinessDetails,
  useBusinessHours,
} from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { useServices, useStaff } from '@/features/catalog/hooks';
import { useCompanionSetup } from '@/features/companion/hooks';
import { getPushPermission } from '@/features/notifications/pushDevice';
import { useHeyClovieOn } from '@/features/voice/hooks';

import { deriveChecklist, type Checklist, type ChecklistItemId } from './logic';
import { useReviewed } from './reviewedStore';

/** Whether the OS lets the app send notifications; re-asked when the app returns from Settings. */
function usePushGranted(): boolean | null {
  const [granted, setGranted] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let alive = true;
    const ask = () =>
      getPushPermission()
        .then((p) => alive && setGranted(p === 'granted'))
        .catch(() => alive && setGranted(false));
    void ask();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void ask();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return granted;
}

export interface SetupChecklistView extends Checklist {
  /** Only the owner sees the checklist. */
  isOwner: boolean;
  markReviewed: (id: ChecklistItemId) => void;
}

/**
 * Gathers what the app already knows and derives the "Get set up" checklist
 * from it. A failed load counts as "not done" rather than "unknown", so one
 * flaky request cannot hide the "Get set up" ring for good.
 */
export function useSetupChecklist(): SetupChecklistView {
  const me = useMe();
  const isOwner = me.data?.role === 'owner';
  const services = useServices();
  const hours = useBusinessHours();
  const staff = useStaff();
  const details = useBusinessDetails();
  const companion = useCompanionSetup({ enabled: isOwner });
  const isVoiceOn = useHeyClovieOn();
  const isPushGranted = usePushGranted();
  const { reviewed, markReviewed } = useReviewed(me.data?.business.id);

  const contact = details.data;
  const checklist = deriveChecklist({
    platform:
      Platform.OS === 'android'
        ? 'android'
        : Platform.OS === 'ios'
          ? 'ios'
          : 'web',
    isWhatsAppConnected: companion.data
      ? companion.data.whatsapp.connected
      : companion.isError
        ? false
        : null,
    servicesCount: services.data?.length ?? (services.isError ? 0 : null),
    hoursCount: hours.data?.length ?? (hours.isError ? 0 : null),
    staffCount: staff.data?.length ?? (staff.isError ? 0 : null),
    hasContactDetails: contact
      ? Boolean(contact.phone || contact.address)
      : details.isError
        ? false
        : null,
    isVoiceOn,
    isPushGranted,
    reviewed,
  });
  return { ...checklist, isOwner, markReviewed };
}
