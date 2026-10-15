import { Button, Text, haptics } from '@booking/ui';
import { Check, MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useMe } from '@/features/business/me';
import { describeError } from '@/lib/toast';

import { useCompanionSetup, useConnectWhatsApp } from '../hooks';
import {
  WHATSAPP_POLL_MS,
  WHATSAPP_POLL_WINDOW_MS,
  deriveConnectCard,
  maskConnectedPhone,
  type ConnectPhase,
} from '../logic';

/** How long the success line stays before the card collapses. */
const COLLAPSE_AFTER_MS = 2_500;
const WHATSAPP_GREEN = '#25D366';

/**
 * Native "Connect WhatsApp" step (CompanionWhatsApp.dc.html). Nerova's widget
 * cannot open its connect popup inside our WebView, so the owner connects in
 * a browser tab and this card watches for the result. Owners only; it renders
 * nothing unless the next setup step is connecting WhatsApp. `onConnected`
 * fires once so the chat can reload with the new state.
 */
export function ConnectWhatsAppCard({
  onConnected,
}: {
  onConnected?: () => void;
}) {
  const { t } = useTranslation();
  const isOwner = useMe().data?.role === 'owner';
  const [phase, setPhase] = React.useState<ConnectPhase>('idle');
  const [failure, setFailure] = React.useState<unknown>(null);
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const setup = useCompanionSetup({
    enabled: isOwner,
    pollMs: phase === 'waiting' ? WHATSAPP_POLL_MS : false,
  });
  const connect = useConnectWhatsApp({
    onOpened: () => setPhase('waiting'),
    onClosed: () => void setup.refetch(),
    onAlreadyConnected: () => setPhase('already_connected'),
    onFailed: (error) => {
      setFailure(error);
      setPhase('failed');
    },
  });

  const state = deriveConnectCard({
    isOwner,
    setup: setup.data,
    phase,
    isCollapsed,
  });

  // Stop asking after a while; the card goes back to its first state.
  React.useEffect(() => {
    if (phase !== 'waiting') return;
    const id = setTimeout(() => setPhase('idle'), WHATSAPP_POLL_WINDOW_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const onConnectedRef = React.useRef(onConnected);
  onConnectedRef.current = onConnected;
  const hasCelebrated = React.useRef(false);
  React.useEffect(() => {
    if (state !== 'connected' || hasCelebrated.current) return;
    hasCelebrated.current = true;
    haptics.success();
    onConnectedRef.current?.();
    const id = setTimeout(() => setIsCollapsed(true), COLLAPSE_AFTER_MS);
    return () => clearTimeout(id);
  }, [state]);

  const begin = () => {
    haptics.light();
    setFailure(null);
    setPhase('starting');
    void connect.start();
  };

  if (state === 'hidden') return null;

  if (state === 'connected') {
    const phone = maskConnectedPhone(setup.data?.whatsapp.display_phone_number);
    return (
      <View
        accessibilityRole="alert"
        className="mx-5 mb-2 flex-row items-center gap-3 rounded-2xl bg-secondary px-4 py-3"
      >
        <View
          className="h-[22px] w-[22px] items-center justify-center rounded-full"
          style={{ backgroundColor: WHATSAPP_GREEN }}
        >
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
        <Text className="min-w-0 flex-1 text-title font-semibold">
          {phone
            ? t('companion.whatsapp.connectedWithPhone', { phone })
            : t('companion.whatsapp.connected')}
        </Text>
      </View>
    );
  }

  const isBusy = state === 'starting';
  return (
    <View
      accessibilityLabel={t('companion.whatsapp.label')}
      className="mx-5 mb-2 gap-3 rounded-2xl bg-secondary px-4 py-4"
    >
      <View className="flex-row items-start gap-3">
        <MessageCircle size={28} color={WHATSAPP_GREEN} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-title font-semibold">
            {t('companion.whatsapp.title')}
          </Text>
          <Text className="text-subtitle text-muted-foreground">
            {state === 'waiting'
              ? t('companion.whatsapp.waiting')
              : t('companion.whatsapp.hint')}
          </Text>
        </View>
      </View>
      {state === 'failed' ? (
        <Text
          accessibilityRole="alert"
          className="text-subtitle text-destructive"
        >
          {t('companion.whatsapp.errorTitle')}. {describeError(failure).message}
        </Text>
      ) : null}
      {state === 'waiting' ? (
        <View
          accessibilityLabel={t('companion.whatsapp.waiting')}
          accessibilityState={{ busy: true }}
          className="flex-row items-center gap-2"
        >
          <ActivityIndicator />
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onPress={begin}
          >
            <Text className="text-title">{t('companion.whatsapp.reopen')}</Text>
          </Button>
        </View>
      ) : (
        <Button
          size="lg"
          disabled={isBusy}
          accessibilityState={{ busy: isBusy }}
          onPress={begin}
        >
          <Text className="text-title">
            {isBusy
              ? t('companion.whatsapp.starting')
              : state === 'failed'
                ? t('common.retry')
                : t('companion.whatsapp.connect')}
          </Text>
        </Button>
      )}
    </View>
  );
}
