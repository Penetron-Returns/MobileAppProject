import type { Approval, CompanionActivity } from '@nerova/react-native';
import * as React from 'react';

/**
 * What the Today home reads from the companion. The SDK's hooks only work
 * below `CompanionProvider`, which lives beside the app (so the app is never
 * remounted when the plan loads), so `CompanionLiveBridge` copies this
 * snapshot across into plain context.
 */
export interface CompanionLive {
  /** `busy` while the companion works on a message. */
  activity: CompanionActivity;
  /** Approvals waiting on the owner, oldest first. */
  pending: readonly Approval[];
  /** True while the sheet is anywhere above `rest`. */
  isSheetOpen: boolean;
  approve: (id: string) => Promise<Approval | null>;
  decline: (id: string) => Promise<Approval | null>;
}

const CompanionLiveContext = React.createContext<CompanionLive | null>(null);

export const CompanionLiveProvider = CompanionLiveContext.Provider;

/** The companion's live state, or null outside the SDK host (flag off, plan without the companion). */
export function useCompanionLive(): CompanionLive | null {
  return React.useContext(CompanionLiveContext);
}
