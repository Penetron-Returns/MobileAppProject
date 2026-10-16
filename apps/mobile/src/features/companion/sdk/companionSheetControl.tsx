import type { AppointmentContext } from '@nerova/react-native';
import * as React from 'react';

export interface OpenCompanionOptions {
  /** Unsent text for the composer (what the owner said to "Hey Clovie"). */
  draft?: string;
  /** The appointment the owner is asking about; shown as a removable chip. */
  context?: AppointmentContext;
}

export interface CompanionSheetControl {
  /** True when the persistent SDK sheet is mounted (flag on and plan has the companion). */
  isAvailable: boolean;
  open: (options?: OpenCompanionOptions) => void;
  close: () => void;
}

const UNAVAILABLE: CompanionSheetControl = {
  isAvailable: false,
  open: () => {},
  close: () => {},
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
