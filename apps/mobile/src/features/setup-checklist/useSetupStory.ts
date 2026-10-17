import { router } from 'expo-router';
import * as React from 'react';

import { useSetupChecklist } from './useSetupChecklist';

export interface SetupStory {
  done: number;
  total: number;
  open: () => void;
}

/**
 * What the stories row needs to show the "Get set up" bubble: progress and
 * how to open the full list. Null (nothing shown) for staff, while the
 * checklist is still loading and once every item is done.
 */
export function useSetupStory(): SetupStory | null {
  const { isOwner, isReady, isComplete, doneCount, items } =
    useSetupChecklist();
  const total = items.length;
  const open = React.useCallback(
    () => router.push('/settings/get-set-up' as never),
    [],
  );
  if (!isOwner || !isReady || isComplete) return null;
  return { done: doneCount, total, open };
}
