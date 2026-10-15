import { Redirect } from 'expo-router';

import { CompanionScreen } from '@/features/companion/components/CompanionScreen';
import { Gate } from '@/features/plans/components/Gate';

/** Paid plans only: Free has no companion, so a deep link goes back to Today. */
export default function CompanionRoute() {
  return (
    <Gate feature="companion" fallback={<Redirect href="/" />}>
      <CompanionScreen />
    </Gate>
  );
}
