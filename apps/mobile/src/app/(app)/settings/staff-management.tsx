import { Users } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function StaffManagementScreen() {
  return (
    <Screen
      header={<Header title="Staff management" fallbackHref="/settings" />}
    >
      <EmptyState
        icon={Users}
        title="Coming soon"
        description="Staff member profiles, assigned services and working hours will live here."
      />
    </Screen>
  );
}
