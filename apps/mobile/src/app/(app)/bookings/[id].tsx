import { CalendarCheck } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function BookingDetailsScreen() {
  return (
    <Screen
      header={<Header title="Booking details" fallbackHref="/calendar" />}
    >
      <EmptyState
        icon={CalendarCheck}
        title="Coming soon"
        description="Detailed view of the appointment, customer notes, status actions, reschedule and cancellation will live here."
      />
    </Screen>
  );
}
