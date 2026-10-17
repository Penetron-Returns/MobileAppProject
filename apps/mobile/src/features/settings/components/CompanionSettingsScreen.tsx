import {
  ErrorState,
  GLYPHS,
  Group,
  GroupRow,
  Page,
  SectionTitle,
  Text,
  TintLink,
} from '@booking/ui';
import { router } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useMe } from '@/features/business/me';
import { useCompanionSetup } from '@/features/companion/hooks';
import { useOpenCompanion } from '@/features/companion/sdk/useOpenCompanion';
import { isSupported as isVoiceSupported } from '@/features/voice/clovieVoice';
import { useHeyClovieOn } from '@/features/voice/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';

import { BookingsByClovieSection } from './BookingsByClovieSection';
import { CompanionGlyph } from './CompanionGlyph';
import { OwnerOnlyNote } from './OwnerOnlyNote';

/**
 * Settings > Clovie: everything about how Clovie behaves, on one screen. Status,
 * a way into the chat, how much Clovie asks before booking, time to undo, who
 * confirms attendance and the voice. Every row is always here: the voice shows
 * dimmed with its reason off Android, and everything the owner alone can
 * change is dimmed for staff.
 */
export function CompanionSettingsScreen() {
  const { t } = useTranslation();
  const openChat = useOpenCompanion();
  const me = useMe();
  const isOwner = me.data?.role === 'owner';
  const setup = useCompanionSetup({ enabled: isOwner });
  const attendance = me.data?.business.attendance_mode;
  const isVoiceOn = useHeyClovieOn();
  const isVoiceAvailable = isVoiceSupported();

  let status: React.ReactNode;
  if (!isOwner) {
    status = (
      <GroupRow
        disabled
        title={t('settings.companionSettings.status')}
        reason={t('settings.clovie.ownerOnly')}
      />
    );
  } else if (isFailed(setup)) {
    status = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(setup))}
        onRetry={() => void setup.refetch()}
      />
    );
  } else {
    const isLive = setup.data?.companion_live;
    status = (
      <GroupRow
        title={t('settings.companionSettings.status')}
        detail={
          isLive === undefined
            ? undefined
            : t(isLive ? 'settings.clovie.live' : 'settings.clovie.paused')
        }
        detailTone={isLive ? 'success' : 'secondary'}
      />
    );
  }

  return (
    <Page
      title={t('settings.items.clovie')}
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
      <Group className="mt-5" radius={26}>
        {status}
      </Group>
      <TintLink
        variant="action"
        icon={MessageCircle}
        label={t('settings.companionSettings.openChat')}
        onPress={openChat}
        className="ml-5 mt-1"
      />

      <BookingsByClovieSection />

      <SectionTitle>{t('settings.clovie.moreTitle')}</SectionTitle>
      <Group radius={26}>
        <GroupRow
          icon={GLYPHS.team}
          title={t('settings.items.attendance')}
          detail={
            attendance
              ? t(`settings.clovie.attendance.${attendance}`)
              : undefined
          }
          onPress={() => router.push('/settings/attendance' as never)}
        />
        <GroupRow
          showSeparator
          icon={GLYPHS.chat}
          title={t('settings.items.voice')}
          detail={t(isVoiceOn ? 'settings.clovie.on' : 'settings.clovie.off')}
          disabled={!isVoiceAvailable}
          reason={t('settings.clovie.voiceAndroidOnly')}
          onPress={() => router.push('/settings/voice' as never)}
        />
      </Group>
      <OwnerOnlyNote />
    </Page>
  );
}
