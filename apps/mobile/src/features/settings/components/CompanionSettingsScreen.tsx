import {
  ErrorState,
  GLYPHS,
  Group,
  GroupRow,
  ListSkeleton,
  Page,
  Text,
} from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  useCompanionSetup,
  useConnectWhatsApp,
} from '@/features/companion/hooks';
import { useOpenCompanion } from '@/features/companion/sdk/useOpenCompanion';
import { isSupported as isVoiceSupported } from '@/features/voice/clovieVoice';
import { formatPhone } from '@/lib/format';
import { isFailed, loadError } from '@/lib/offline';
import { describeError, toast } from '@/lib/toast';

import { BookingsByClovieSection } from './BookingsByClovieSection';
import { CompanionGlyph } from './CompanionGlyph';

/**
 * Settings > Companion: who the companion is, whether it is live, the WhatsApp
 * connection, the voice and attendance settings, and a way into the chat. The
 * chat itself lives behind the "Open chat" row (and the dome), not here.
 */
export function CompanionSettingsScreen() {
  const { t } = useTranslation();
  const openChat = useOpenCompanion();
  const setup = useCompanionSetup({ enabled: true });
  const connect = useConnectWhatsApp({
    onOpened: () => undefined,
    onClosed: () => void setup.refetch(),
    onAlreadyConnected: () => void setup.refetch(),
    onFailed: (error) =>
      toast.failed(t('settings.companionSettings.connectFailed'), error),
  });

  let body: React.ReactNode;
  if (isFailed(setup)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(setup))}
        onRetry={() => void setup.refetch()}
      />
    );
  } else if (setup.isPending) {
    body = <ListSkeleton rows={3} />;
  } else {
    const { whatsapp, companion_live: isLive } = setup.data;
    body = (
      <Group className="mt-5" radius={26}>
        <GroupRow
          title={t('settings.companionSettings.status')}
          detail={t(
            isLive
              ? 'settings.companionSettings.live'
              : 'settings.companionSettings.paused',
          )}
          detailTone={isLive ? 'success' : 'secondary'}
        />
        <GroupRow
          showSeparator
          icon={GLYPHS.chat}
          title={t('settings.companionSettings.whatsapp')}
          subtitle={
            whatsapp.connected
              ? formatPhone(whatsapp.display_phone_number) || undefined
              : t('settings.companionSettings.whatsappNotConnected')
          }
          detail={
            whatsapp.connected
              ? t('settings.companionSettings.whatsappConnected')
              : undefined
          }
          detailTone={whatsapp.connected ? 'success' : 'secondary'}
          onPress={whatsapp.connected ? undefined : () => void connect.start()}
        />
        {isVoiceSupported() ? (
          <GroupRow
            showSeparator
            icon={GLYPHS.chat}
            title={t('settings.items.voice')}
            onPress={() => router.push('/settings/voice' as never)}
          />
        ) : null}
        <GroupRow
          showSeparator
          icon={GLYPHS.team}
          title={t('settings.items.attendance')}
          onPress={() => router.push('/settings/attendance' as never)}
        />
        <GroupRow
          showSeparator
          icon={CompanionGlyph}
          title={t('settings.companionSettings.openChat')}
          onPress={openChat}
        />
      </Group>
    );
  }

  return (
    <Page
      title={t('settings.companionSettings.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => setup.refetch()}
    >
      <View className="mx-5 mt-4 flex-row items-center gap-3.5">
        <CompanionGlyph size={56} />
        <Text className="text-[20px] font-semibold leading-[25px]">
          {t('auth.appName')}
        </Text>
      </View>
      {body}
      <BookingsByClovieSection />
    </Page>
  );
}
