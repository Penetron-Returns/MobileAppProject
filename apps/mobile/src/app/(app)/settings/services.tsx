import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { ServicesScreen } from '@/features/settings/components/ServicesScreen';

export default function ServicesRoute() {
  return (
    <OwnerOnly>
      <ServicesScreen />
    </OwnerOnly>
  );
}
