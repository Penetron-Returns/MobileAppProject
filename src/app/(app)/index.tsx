import { LayoutDashboard } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function DashboardScreen() {
  return (
    <Screen header={<Header title="Dashboard" hideBack />}>
      <EmptyState
        icon={LayoutDashboard}
        title="Coming soon"
        description="Monthly revenue, today's bookings and the next appointment will live here."
      />
    </Screen>
  );
}
