import {
  Button,
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  Page,
  Text,
} from '@booking/ui';
import { useFocusEffect } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useMe } from '@/features/business/me';
import { formatPhone } from '@/lib/format';
import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';

import {
  useWhatsAppChannel,
  useWhatsAppChannelAction,
} from '../useWhatsAppChannel';
import { channelAction, channelPill } from '../whatsappChannel';
import { OwnerOnlyNote } from './OwnerOnlyNote';

const K = 'settings.whatsapp.channel';

/**
 * Settings > WhatsApp on Free: the booking menu's number, its verified name
 * and whether it is live, read from the channel status. The owner can pause
 * and resume it. Connecting a number is not done in the app.
 */
export function FreeWhatsAppSettings() {
  const { t } = useTranslation();
  const isOwner = useMe().data?.role === 'owner';
  const channel = useWhatsAppChannel();
  const action = useWhatsAppChannelAction();
  const { refetch } = channel;
  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const pill = channel.data ? channelPill(channel.data) : null;
  let body: React.ReactNode;
  if (isFailed(channel)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(channel))}
        onRetry={() => void refetch()}
      />
    );
  } else if (!channel.data || !pill) {
    body = <ListSkeleton rows={3} />;
  } else {
    const next = isOwner ? channelAction(pill) : null;
    body = (
      <>
        <GroupRow
          title={t(`${K}.status`)}
          detail={t(`${K}.pill.${pill}`)}
          detailTone={pill === 'live' ? 'success' : 'secondary'}
        />
        <GroupRow
          showSeparator
          title={t(`${K}.number`)}
          detail={formatPhone(channel.data.display_phone) || t(`${K}.none`)}
        />
        <GroupRow
          showSeparator
          title={t(`${K}.verifiedName`)}
          detail={channel.data.verified_name ?? t(`${K}.none`)}
        />
        {next ? (
          <Button
            variant="secondary"
            loading={action.isPending}
            onPress={() => action.mutate(next)}
            accessibilityLabel={t(`${K}.${next}`)}
            className="m-4"
          >
            <Text>{t(`${K}.${next}`)}</Text>
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <Page
      title={t('settings.whatsapp.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => refetch()}
    >
      <Group className="mt-5" radius={26}>
        {body}
      </Group>
      {pill ? (
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {t(`${K}.hint.${pill}`)}
        </Text>
      ) : null}
      <OwnerOnlyNote />
    </Page>
  );
}
