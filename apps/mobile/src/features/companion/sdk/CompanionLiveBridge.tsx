import { useCompanion } from '@nerova/react-native';
import * as React from 'react';

import type { CompanionLive } from './companionLive';

/** Renders nothing: reports the SDK's activity, approvals and sheet state to the app shell. */
export function CompanionLiveBridge({
  onChange,
}: {
  onChange: (live: CompanionLive) => void;
}) {
  const { activity, approvals, sheet } = useCompanion();
  const approveRef = React.useRef(approvals.approve);
  const declineRef = React.useRef(approvals.decline);
  approveRef.current = approvals.approve;
  declineRef.current = approvals.decline;
  const approve = React.useCallback((id: string) => approveRef.current(id), []);
  const decline = React.useCallback((id: string) => declineRef.current(id), []);

  const { pending } = approvals;
  const isSheetOpen = sheet.state !== 'rest';
  React.useEffect(
    () => onChange({ activity, pending, isSheetOpen, approve, decline }),
    [onChange, activity, pending, isSheetOpen, approve, decline],
  );
  return null;
}
