import * as React from 'react';

import { getCompanionSetup } from '@/features/companion/sdk/inlineSetup';

/**
 * The Clovie tab's main slot. With an SDK that ships `<CompanionSetup>` it is
 * the guided setup while setup is needed and `children` (the moment) once
 * live. Without it, `children` render as before and setup lives in the sheet.
 */
export function InlineCompanionSetup({
  children,
  onLive,
}: {
  children: React.ReactNode;
  onLive?: () => void;
}) {
  const Setup = getCompanionSetup();
  if (!Setup) return <>{children}</>;
  return <Setup onLive={onLive}>{children}</Setup>;
}
