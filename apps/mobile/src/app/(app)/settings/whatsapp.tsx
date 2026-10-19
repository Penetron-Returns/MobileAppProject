import { useEntitlements } from '@/features/plans/hooks';
import { FreeWhatsAppSettings } from '@/features/settings/components/FreeWhatsAppSettings';
import { PaidWhatsAppSettings } from '@/features/settings/components/PaidWhatsAppSettings';

/** With Clovie the screen guides the go-live; Free only shows the channel's status. */
export default function Route() {
  return useEntitlements().hasClovie ? (
    <PaidWhatsAppSettings />
  ) : (
    <FreeWhatsAppSettings />
  );
}
