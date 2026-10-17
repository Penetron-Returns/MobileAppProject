import { Redirect } from 'expo-router';

import { InboxScreen } from '@/features/inbox/components/InboxScreen';
import { Gate } from '@/features/plans/components/Gate';

/** Only a plan with the `inbox` feature opens this; every other plan is sent to the Clovie tab. */
export default function InboxRoute() {
  return (
    <Gate feature="inbox" fallback={<Redirect href="/" />}>
      <InboxScreen />
    </Gate>
  );
}
