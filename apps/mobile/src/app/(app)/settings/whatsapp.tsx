import { OwnerOnly } from '@/features/business/components/OwnerOnly';
import { WhatsAppSettingsScreen } from '@/features/settings/components/WhatsAppScreens';

export default function Route() {
  return (
    <OwnerOnly>
      <WhatsAppSettingsScreen />
    </OwnerOnly>
  );
}
