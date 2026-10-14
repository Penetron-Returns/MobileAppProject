import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { TeamScreen } from '@/features/team/components/TeamScreen';

export default function TeamRoute() {
  return (
    <OwnerOnly>
      <TeamScreen />
    </OwnerOnly>
  );
}
