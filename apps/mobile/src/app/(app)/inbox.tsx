import { InboxScreen } from '@/features/inbox/components/InboxScreen';
import { Gate } from '@/features/plans/components/Gate';

export default function InboxRoute() {
  return (
    <Gate feature="inbox">
      <InboxScreen />
    </Gate>
  );
}
