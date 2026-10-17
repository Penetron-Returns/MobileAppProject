import {
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  Page,
  Text,
  TintLink,
} from '@booking/ui';
import { Link2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useMe } from '@/features/business/me';
import {
  useCompanionSetup,
  useConnectWhatsApp,
} from '@/features/companion/hooks';
import { formatPhone } from '@/lib/format';
import { isFailed, loadError } from '@/lib/offline';
import { describeError, toast } from '@/lib/toast';

import { OwnerOnlyNote } from './OwnerOnlyNote';
import { RemindersRow } from './RemindersRow';

/**
 * Settings > WhatsApp on a paid plan: the number Clovie answers on, from
 * Nerova's setup (the free-plan booking menu is not part of these plans), the
 * connect flow while nothing is connected, and when client reminders go out.
 * Staff see the same rows; the setup and connect calls are owner-only.
 */
export function PaidWhatsAppSettings() {
  const { t } = useTranslation();
  const isOwner = useMe().data?.role === 'owner';
  const setup = useCompanionSetup({ enabled: isOwner });
  const connect = useConnectWhatsApp({
    onOpened: () => undefined,
    onClosed: () => void setup.refetch(),
    onAlreadyConnected: () => void setup.refetch(),
    onFailed: (error) =>
      toast.failed(t('settings.companionSettings.connectFailed'), error),
  });
  const wa = setup.data?.whatsapp;
  const phone = wa?.connected ? formatPhone(wa.display_phone_number) : '';

  let status: React.ReactNode;
  if (!isOwner) {
    status = (
      <GroupRow
        disabled
        title={t('settings.whatsapp.title')}
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
  } else if (!wa) {
    status = <ListSkeleton rows={1} />;
  } else {
    status = (
      <GroupRow
        title={t('settings.whatsapp.title')}
        subtitle={phone || t('settings.whatsapp.notConnected')}
        detail={t(
          wa.connected
            ? 'settings.whatsapp.rowStatus.live'
            : 'settings.whatsapp.rowStatus.none',
        )}
        detailTone={wa.connected ? 'success' : 'secondary'}
      />
    );
  }

  return (
    <Page
      title={t('settings.whatsapp.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => setup.refetch()}
    >
      <Group className="mt-5" radius={26}>
        {status}
        <RemindersRow showSeparator />
      </Group>
      {isOwner && wa && !wa.connected ? (
        <TintLink
          variant="action"
          icon={Link2}
          label={t('settings.whatsapp.connect')}
          onPress={() => void connect.start()}
          className="ml-5 mt-1"
        />
      ) : null}
      <Text className="mx-5 mt-3 text-meta text-muted-foreground">
        {t('settings.whatsapp.remindersFooter')}
      </Text>
      <Text className="mx-5 mt-2 text-meta text-muted-foreground">
        {t('settings.whatsapp.customersSeeLine', {
          menu: ['book', 'bookings', 'talk']
            .map((id) => t(`settings.whatsapp.menu.${id}`))
            .join(', '),
        })}
      </Text>
      <OwnerOnlyNote />
    </Page>
  );
}
