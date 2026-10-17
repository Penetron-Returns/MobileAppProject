import { router } from 'expo-router';
import * as React from 'react';

import { useCompanionSheet } from '@/features/companion/sdk/companionSheetControl';

import { CHECKLIST_ROUTES, type ChecklistItemId } from './logic';

/**
 * What tapping a checklist item does: the test message opens Nerova's setup
 * sheet on that step; every other item is marked as looked at and opens its
 * Settings screen.
 */
export function useOpenChecklistItem(
  markReviewed: (id: ChecklistItemId) => void,
) {
  const sheet = useCompanionSheet();
  return React.useCallback(
    (id: ChecklistItemId) => {
      if (id === 'testMessage') {
        sheet.openSetup('test_message');
        return;
      }
      markReviewed(id);
      router.push(CHECKLIST_ROUTES[id] as never);
    },
    [markReviewed, sheet],
  );
}
