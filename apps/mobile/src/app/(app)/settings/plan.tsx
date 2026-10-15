import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { PlanScreen } from '@/features/plans/components/PlanScreen';

export default function PlanRoute() {
  return (
    <OwnerOnly>
      <PlanScreen />
    </OwnerOnly>
  );
}
