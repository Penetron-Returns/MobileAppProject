import { router } from 'expo-router';
import * as React from 'react';

import { useCompanionSheet } from './companionSheetControl';

/** Opens the companion: the persistent sheet when the SDK can serve it, the companion route otherwise. */
export function useOpenCompanion(): () => void {
  const sheet = useCompanionSheet();
  const { isAvailable, open } = sheet;
  return React.useCallback(() => {
    if (isAvailable) open();
    else router.push('/companion' as never);
  }, [isAvailable, open]);
}
