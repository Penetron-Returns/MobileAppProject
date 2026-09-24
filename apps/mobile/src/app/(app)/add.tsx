import { PlusCircle } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function AddBookingScreen() {
  return (
    <Screen header={<Header title="Add booking" hideBack />}>
      <EmptyState
        icon={PlusCircle}
        title="Coming soon"
        description="Client, service, date, time and staff selection will live here."
      />
    </Screen>
  );
}
