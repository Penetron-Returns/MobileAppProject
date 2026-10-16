import { companionSdkEnabled } from '@/lib/env';

import { CompanionSdkRoute } from '../sdk/CompanionSdkRoute';
import { CompanionScreen } from './CompanionScreen';

/** The companion route's body: the SDK sheet when `EXPO_PUBLIC_COMPANION_SDK=1`, else the iframe sheet. */
export function CompanionSwitch() {
  return companionSdkEnabled ? <CompanionSdkRoute /> : <CompanionScreen />;
}
