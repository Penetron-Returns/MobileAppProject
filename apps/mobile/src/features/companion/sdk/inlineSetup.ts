import * as Sdk from '@nerova/react-native';
import type * as React from 'react';

export interface InlineSetupProps {
  /** Fires once the owner has gone live from the inline setup. */
  onLive?: () => void;
  /** Rendered once setup is finished (or was never needed). */
  children?: React.ReactNode;
}

/**
 * Nerova's inline setup wrapper (`<CompanionSetup>`), when the installed SDK
 * ships it. Detected through the package's public exports, never a deep
 * import: older previews return undefined and callers keep the sheet.
 */
export function getCompanionSetup():
  React.ComponentType<InlineSetupProps> | undefined {
  const found = (Sdk as Record<string, unknown>).CompanionSetup;
  return found ? (found as React.ComponentType<InlineSetupProps>) : undefined;
}
