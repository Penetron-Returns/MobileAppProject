import { Redirect } from 'expo-router';

import { Gate } from '@/features/plans/components/Gate';
import { ReportsScreen } from '@/features/reports/components/ReportsScreen';

/** Paid plans only (`reports`): Free has no reports, so a deep link goes back to Today. */
export default function ReportsRoute() {
  return (
    <Gate feature="reports" fallback={<Redirect href="/" />}>
      <ReportsScreen />
    </Gate>
  );
}
