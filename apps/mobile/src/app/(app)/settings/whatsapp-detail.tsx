import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { WhatsAppDetailScreen } from '@/features/settings/components/WhatsAppScreens';

export default function Route() {
  return (
    <OwnerOnly>
      <WhatsAppDetailScreen />
    </OwnerOnly>
  );
}
