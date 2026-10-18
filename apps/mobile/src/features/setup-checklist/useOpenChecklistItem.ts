import { router } from 'expo-router';
import * as React from 'react';

import { useCompanionSetup } from '@/features/companion/hooks';
import { useCompanionSheet } from '@/features/companion/sdk/companionSheetControl';

import { CHECKLIST_ROUTES, type ChecklistItemId } from './logic';

/**
 * What tapping a checklist item does: it is marked as looked at and its
 * Settings screen opens. The WhatsApp item (the SDK path active) goes
 * straight into Clovie's guided setup instead of Settings.
 */
export function useOpenChecklistItem(
  markReviewed: (id: ChecklistItemId) => void,
) {
  const { isAvailable, openSetup } = useCompanionSheet();
  const isConnected = useCompanionSetup({ enabled: true }).data?.whatsapp
    .connected;
  return React.useCallback(
    (id: ChecklistItemId) => {
      markReviewed(id);
      if (id === 'whatsapp' && isAvailable && !isConnected) openSetup();
      else router.push(CHECKLIST_ROUTES[id] as never);
    },
    [markReviewed, isAvailable, isConnected, openSetup],
  );
}
