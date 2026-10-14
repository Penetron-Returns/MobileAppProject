import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { BookingRulesScreen } from '@/features/settings/components/BookingRulesScreen';

export default function Route() {
  return (
    <OwnerOnly>
      <BookingRulesScreen />
    </OwnerOnly>
  );
}
