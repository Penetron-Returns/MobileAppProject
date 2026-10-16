import { Redirect } from 'expo-router';

import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { Gate } from '@/features/plans/components/Gate';
import { CompanionSettingsScreen } from '@/features/settings/components/CompanionSettingsScreen';

/** Paid plans only (Free has no companion), owners only. */
export default function Route() {
  return (
    <OwnerOnly>
      <Gate feature="companion" fallback={<Redirect href="/settings" />}>
        <CompanionSettingsScreen />
      </Gate>
    </OwnerOnly>
  );
}
