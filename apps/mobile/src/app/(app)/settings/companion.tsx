import { Redirect } from 'expo-router';

import { Gate } from '@/features/plans/components/Gate';
import { CompanionSettingsScreen } from '@/features/settings/components/CompanionSettingsScreen';

/** Paid plans only (Free has no companion; its row is shown disabled). Staff open it read-only. */
export default function Route() {
  return (
    <Gate feature="companion" fallback={<Redirect href="/settings" />}>
      <CompanionSettingsScreen />
    </Gate>
  );
}
