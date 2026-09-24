import { Users } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function ClientsScreen() {
  return (
    <Screen header={<Header title="Clients" hideBack />}>
      <EmptyState
        icon={Users}
        title="Coming soon"
        description="Search and the All / Recent / VIP client lists will live here."
      />
    </Screen>
  );
}
