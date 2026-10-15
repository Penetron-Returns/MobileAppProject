import { Redirect } from 'expo-router';

import { InboxScreen } from '@/features/inbox/components/InboxScreen';
import { Gate } from '@/features/plans/components/Gate';

/** The Inbox belongs to Free: paid plans have the companion instead and are sent to Today. */
export default function InboxRoute() {
  return (
    <Gate feature="inbox" fallback={<Redirect href="/" />}>
      <InboxScreen />
    </Gate>
  );
}
