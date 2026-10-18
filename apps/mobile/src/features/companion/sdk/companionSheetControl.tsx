import type { AppointmentContext } from '@nerova/react-native';
import * as React from 'react';

export interface OpenCompanionOptions {
  /** Unsent text for the composer (what the owner said to "Hey Clovie"). */
  draft?: string;
  /** The appointment the owner is asking about; shown as a removable chip. */
  context?: AppointmentContext;
}

export interface CompanionSheetControl {
  /** True when the persistent SDK sheet is mounted and can chat (flag on, plan has the companion, account ready). */
  isAvailable: boolean;
  /** True when the sheet is mounted but the SDK reports it unavailable (e.g. `account_not_ready`): callers use the iframe path. */
  hasFailed: boolean;
  open: (options?: OpenCompanionOptions) => void;
  close: () => void;
  /**
   * Takes the owner to Clovie's guided setup (WhatsApp, then go live): the
   * Clovie tab when the SDK renders setup inline, else the sheet, which shows
   * the setup while it is needed. A no-op when `isAvailable` is false.
   */
  openSetup: () => void;
}

const UNAVAILABLE: CompanionSheetControl = {
  isAvailable: false,
  hasFailed: false,
  open: () => {},
  close: () => {},
  openSetup: () => {},
};

const CompanionSheetControlContext =
  React.createContext<CompanionSheetControl>(UNAVAILABLE);

export const CompanionSheetControlProvider =
  CompanionSheetControlContext.Provider;

/**
 * The app-level handle on the persistent companion sheet. Outside the SDK
 * host (flag off, or no companion on the plan) `isAvailable` is false and the
 * callers keep their route-based path.
 */
export function useCompanionSheet(): CompanionSheetControl {
  return React.useContext(CompanionSheetControlContext);
}
