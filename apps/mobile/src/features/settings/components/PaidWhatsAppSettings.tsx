import {
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  Page,
  SectionTitle,
  Text,
  TintLink,
} from '@booking/ui';
import { useFocusEffect } from 'expo-router';
import { Link2 } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useMe } from '@/features/business/me';
import { useCompanionSetup } from '@/features/companion/hooks';
import { useWhatsAppSetupEntry } from '@/features/companion/useWhatsAppSetupEntry';
import { formatPhone } from '@/lib/format';
import { isFailed, loadError } from '@/lib/offline';
import { describeError, toast } from '@/lib/toast';

import { goLiveSteps, verificationPill, whatsAppPill } from '../whatsappStatus';
import { OwnerOnlyNote } from './OwnerOnlyNote';
import { RemindersRow } from './RemindersRow';

/**
 * Settings > WhatsApp on a paid plan: the number Clovie answers on, whether
 * the business is verified, what is left before Clovie is live (each step
 * opens Clovie's guided setup) and when client reminders go out. Staff see
 * the rows but nothing to act on: the setup and connect calls are owner-only.
 */
export function PaidWhatsAppSettings() {
  const { t } = useTranslation();
  const isOwner = useMe().data?.role === 'owner';
  const setup = useCompanionSetup({ enabled: isOwner });
  const entry = useWhatsAppSetupEntry({
    onOpened: () => undefined,
    onClosed: () => void setup.refetch(),
    onAlreadyConnected: () => void setup.refetch(),
    onFailed: (error) =>
      toast.failed(t('settings.companionSettings.connectFailed'), error),
  });
  const { refetch } = setup;
  useFocusEffect(
    React.useCallback(() => {
      if (isOwner) void refetch();
    }, [isOwner, refetch]),
  );

  const data = setup.data;
  const steps = data ? goLiveSteps(data) : [];
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
        onRetry={() => void refetch()}
      />
    );
  } else if (!data) {
    status = <ListSkeleton rows={2} />;
  } else {
    const pill = whatsAppPill(data);
    const phone = formatPhone(data.whatsapp.display_phone_number);
    status = (
      <>
        <GroupRow
          title={t('settings.whatsapp.title')}
          subtitle={pill === 'connected' && phone ? phone : undefined}
          detail={t(`settings.whatsapp.pill.${pill}`)}
          detailTone={pill === 'connected' ? 'success' : 'secondary'}
        />
        <GroupRow
          showSeparator
          title={t('settings.whatsapp.verification.title')}
          detail={t(
            `settings.whatsapp.verification.${verificationPill(data.whatsapp)}`,
          )}
          detailTone={data.whatsapp.business_verified ? 'success' : 'secondary'}
        />
      </>
    );
  }

  return (
    <Page
      title={t('settings.whatsapp.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => (isOwner ? refetch() : undefined)}
    >
      <Group className="mt-5" radius={26}>
        {status}
      </Group>

      {isOwner && data ? (
        <>
          <SectionTitle>{t('settings.whatsapp.toGoLive')}</SectionTitle>
          {steps.length === 0 ? (
            <Group radius={26}>
              <GroupRow title={t('settings.whatsapp.live')} />
            </Group>
          ) : (
            <Group radius={26}>
              {steps.map((id, index) => (
                <GroupRow
                  key={id}
                  showSeparator={index > 0}
                  title={t(`settings.whatsapp.step.${id}`)}
                  subtitle={t(`settings.whatsapp.step.${id}Hint`)}
                  onPress={entry.start}
                  accessibilityLabel={t(`settings.whatsapp.step.${id}`)}
                />
              ))}
            </Group>
          )}
          {data.whatsapp.connected ? (
            <TintLink
              variant="action"
              icon={Link2}
              label={t('settings.whatsapp.reconnect')}
              onPress={entry.start}
              className="ml-5 mt-1"
            />
          ) : null}
        </>
      ) : null}

      <Group className="mt-5" radius={26}>
        <RemindersRow />
      </Group>
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
