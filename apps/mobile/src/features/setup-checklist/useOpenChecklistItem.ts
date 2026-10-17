import { router } from 'expo-router';
import * as React from 'react';

import { CHECKLIST_ROUTES, type ChecklistItemId } from './logic';

/**
 * What tapping a checklist item does: it is marked as looked at and its
 * Settings screen opens.
 */
export function useOpenChecklistItem(
  markReviewed: (id: ChecklistItemId) => void,
) {
  return React.useCallback(
    (id: ChecklistItemId) => {
      markReviewed(id);
      router.push(CHECKLIST_ROUTES[id] as never);
    },
    [markReviewed],
  );
}
