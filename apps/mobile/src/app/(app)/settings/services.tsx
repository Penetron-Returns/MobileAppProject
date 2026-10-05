import { Sparkles } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function ServicesScreen() {
  return (
    <Screen header={<Header title="Services" fallbackHref="/settings" />}>
      <EmptyState
        icon={Sparkles}
        title="Coming soon"
        description="Service catalogue, durations, pricing and active services will live here."
      />
    </Screen>
  );
}
