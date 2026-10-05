import { User } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function ClientDetailsScreen() {
  return (
    <Screen header={<Header title="Client details" fallbackHref="/clients" />}>
      <EmptyState
        icon={User}
        title="Coming soon"
        description="Client contact details, booking history, preferences and notes will live here."
      />
    </Screen>
  );
}
