import { Clock } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function OperatingHoursScreen() {
  return (
    <Screen
      header={<Header title="Operating hours" fallbackHref="/settings" />}
    >
      <EmptyState
        icon={Clock}
        title="Coming soon"
        description="Weekly business hours, open days and holiday overrides will live here."
      />
    </Screen>
  );
}
