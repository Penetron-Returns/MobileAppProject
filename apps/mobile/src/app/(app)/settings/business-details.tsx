import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { BusinessDetailsScreen } from '@/features/settings/components/BusinessDetailsScreen';

export default function BusinessDetailsRoute() {
  return (
    <OwnerOnly>
      <BusinessDetailsScreen />
    </OwnerOnly>
  );
}
