import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';

import { useCompanionSheet } from './companionSheetControl';

/** Leaves the route; falls back to Today when opened from a deep link. */
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * The `companion` route when the SDK flag is on. The sheet is already mounted
 * in the shell, so this only asks it to open (with any `heard` draft) and
 * leaves at once, so the sheet shows over the screen underneath.
 */
export function CompanionSdkRoute() {
  const { heard } = useLocalSearchParams<{ heard?: string }>();
  const sheet = useCompanionSheet();
  const handled = React.useRef(false);
  React.useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    sheet.open(heard ? { draft: heard } : undefined);
    leave();
  }, [sheet, heard]);
  return null;
}
