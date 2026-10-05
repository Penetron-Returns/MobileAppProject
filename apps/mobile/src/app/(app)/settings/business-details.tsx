import { Building2 } from 'lucide-react-native';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/States';

export default function BusinessDetailsScreen() {
  return (
    <Screen
      header={<Header title="Business details" fallbackHref="/settings" />}
    >
      <EmptyState
        icon={Building2}
        title="Coming soon"
        description="Business name, phone number, address, currency and booking rules will live here."
      />
    </Screen>
  );
}
