import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

import { useMe } from '@/features/business/me';

import { useCompanionSetup } from './hooks';
import { useCompanionSheet } from './sdk/companionSheetControl';

export const setupOpenedKey = (businessId: string) =>
  `companion.setupOpened.v1.${businessId}`;

/**
 * After onboarding, the first time the owner lands in the tabs with
 * WhatsApp still to connect, Clovie's setup is brought up once (the companion
 * sheet, which shows Nerova's setup while it is needed). A per-business flag
 * keeps it from ever nagging again.
 */
export function useOpenSetupOnce(): void {
  const me = useMe();
  const businessId = me.data?.business.id;
  const isOwner = me.data?.role === 'owner';
  const { isAvailable, open } = useCompanionSheet();
  const setup = useCompanionSetup({ enabled: isOwner });
  const needs =
    setup.data?.next_step === 'connect_whatsapp' && !setup.data.companion_live;
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current || !businessId || !isOwner || !isAvailable || !needs) {
      return;
    }
    done.current = true;
    const key = setupOpenedKey(businessId);
    void AsyncStorage.getItem(key)
      .then((seen) => {
        if (seen) return;
        void AsyncStorage.setItem(key, '1').catch(() => undefined);
        open();
      })
      .catch(() => undefined);
  }, [businessId, isOwner, isAvailable, needs, open]);
}
