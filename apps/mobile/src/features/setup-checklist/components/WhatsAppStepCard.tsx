import { Button, Text, haptics } from '@booking/ui';
import { MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useCompanionSetup } from '@/features/companion/hooks';
import { useWhatsAppSetupEntry } from '@/features/companion/useWhatsAppSetupEntry';
import {
  WHATSAPP_POLL_MS,
  WHATSAPP_POLL_WINDOW_MS,
} from '@/features/companion/logic';
import { toast } from '@/lib/toast';

const WHATSAPP_GREEN = '#25D366';

/**
 * The one required step: connect WhatsApp so Clovie can take bookings. Starts
 * the existing connect flow straight from the list and watches for the result,
 * so the ring and the list update the moment it is connected.
 */
export function WhatsAppStepCard() {
  const { t } = useTranslation();
  const [isWaiting, setIsWaiting] = React.useState(false);
  const setup = useCompanionSetup({
    enabled: true,
    pollMs: isWaiting ? WHATSAPP_POLL_MS : false,
  });
  const connect = useWhatsAppSetupEntry({
    onOpened: () => setIsWaiting(true),
    onClosed: () => void setup.refetch(),
    onAlreadyConnected: () => void setup.refetch(),
    onFailed: (error) => {
      setIsWaiting(false);
      toast.failed(t('settings.companionSettings.connectFailed'), error);
    },
  });
  React.useEffect(() => {
    if (!isWaiting) return;
    const id = setTimeout(() => setIsWaiting(false), WHATSAPP_POLL_WINDOW_MS);
    return () => clearTimeout(id);
  }, [isWaiting]);

  return (
    <View className="mx-5 mt-4 gap-3 rounded-3xl bg-secondary px-4 py-4">
      <View className="flex-row items-start gap-3">
        <MessageCircle size={28} color={WHATSAPP_GREEN} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-title font-semibold">
            {t('checklist.whatsapp.title')}
          </Text>
          <Text className="text-subtitle text-muted-foreground">
            {isWaiting
              ? t('companion.whatsapp.waiting')
              : t('checklist.whatsapp.why')}
          </Text>
        </View>
        <Text className="text-subtitle font-semibold text-destructive">
          {t('checklist.required')}
        </Text>
      </View>
      <Button
        size="lg"
        disabled={connect.isStarting}
        accessibilityState={{ busy: connect.isStarting || isWaiting }}
        onPress={() => {
          haptics.light();
          void connect.start();
        }}
      >
        {isWaiting ? <ActivityIndicator /> : null}
        <Text className="text-title">
          {isWaiting
            ? t('companion.whatsapp.reopen')
            : t('checklist.whatsapp.connect')}
        </Text>
      </Button>
    </View>
  );
}
