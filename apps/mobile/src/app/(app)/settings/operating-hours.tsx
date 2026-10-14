import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { OperatingHoursScreen } from '@/features/settings/components/OperatingHoursScreen';

export default function OperatingHoursRoute() {
  return (
    <OwnerOnly>
      <OperatingHoursScreen />
    </OwnerOnly>
  );
}
