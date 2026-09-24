import { CalendarDays } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function CalendarScreen() {
  return (
    <Screen header={<Header title="Calendar" hideBack />}>
      <EmptyState
        icon={CalendarDays}
        title="Coming soon"
        description="Day, week and month views of the schedule will live here."
      />
    </Screen>
  );
}
