import { companionSdkEnabled } from '@/lib/env';

import { useCompanionSheet } from '../sdk/companionSheetControl';
import { CompanionSdkRoute } from '../sdk/CompanionSdkRoute';
import { CompanionScreen } from './CompanionScreen';

/** The companion route's body: the SDK sheet when `EXPO_PUBLIC_COMPANION_SDK=1` (and it is available), else the iframe sheet. */
export function CompanionSwitch() {
  const { hasFailed } = useCompanionSheet();
  // A sheet the SDK reports unavailable (account not ready) would open dead:
  // the iframe screen shows its own explanation instead.
  return companionSdkEnabled && !hasFailed ? (
    <CompanionSdkRoute />
  ) : (
    <CompanionScreen />
  );
}
