import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { AppState, Platform } from 'react-native';

import {
  useBusinessDetails,
  useBusinessHours,
} from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { useServices, useStaff } from '@/features/catalog/hooks';
import { getPushPermission } from '@/features/notifications/pushDevice';
import { useHeyClovieOn } from '@/features/voice/hooks';

import {
  deriveChecklist,
  parseReviewed,
  serializeReviewed,
  type Checklist,
  type ChecklistItemId,
} from './logic';

const keyFor = (businessId: string) => `checklist.reviewed.v1.${businessId}`;

/** Which items the owner has opened, kept per business on this phone. */
function useReviewed(businessId: string | undefined) {
  const [reviewed, setReviewed] = React.useState<ReadonlySet<ChecklistItemId>>(
    () => new Set(),
  );
  React.useEffect(() => {
    if (!businessId) return;
    let alive = true;
    AsyncStorage.getItem(keyFor(businessId))
      .then((raw) => alive && setReviewed(parseReviewed(raw)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [businessId]);

  const markReviewed = React.useCallback(
    (id: ChecklistItemId) => {
      if (!businessId) return;
      setReviewed((current) => {
        if (current.has(id)) return current;
        const next = new Set(current).add(id);
        AsyncStorage.setItem(keyFor(businessId), serializeReviewed(next)).catch(
          () => undefined,
        );
        return next;
      });
    },
    [businessId],
  );
  return { reviewed, markReviewed };
}

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

/** Gathers what the app already knows and derives the "Get set up" checklist from it. */
export function useSetupChecklist(): SetupChecklistView {
  const me = useMe();
  const isOwner = me.data?.role === 'owner';
  const services = useServices();
  const hours = useBusinessHours();
  const staff = useStaff();
  const details = useBusinessDetails();
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
    servicesCount: services.data?.length ?? null,
    hoursCount: hours.data?.length ?? null,
    staffCount: staff.data?.length ?? null,
    hasContactDetails: contact
      ? Boolean(contact.phone || contact.address)
      : null,
    isVoiceOn,
    isPushGranted,
    reviewed,
  });
  return { ...checklist, isOwner, markReviewed };
}
