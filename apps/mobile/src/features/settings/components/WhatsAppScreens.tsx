import {
  Button,
  ConfirmDialog,
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  Page,
  SectionTitle,
  Switch,
  Text,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBusinessDetails } from '@/features/business/hooks';
import { useCanManage } from '@/features/business/me';
import { Gate } from '@/features/plans/components/Gate';
import { isFailed, loadError } from '@/lib/offline';
import { formatPhone } from '@/lib/format';
import { toast, describeError } from '@/lib/toast';

import {
  useSendTestMessage,
  useWhatsAppAction,
  useWhatsAppChannel,
} from '../hooks';
import { whatsAppStatusKey } from '../whatsapp';

/** Settings > WhatsApp: on/off for the booking menu, and a way into the details. */
export function WhatsAppSettingsScreen() {
  return (
    <Gate feature="whatsapp_menu">
      <WhatsAppSettingsBody />
    </Gate>
  );
}

function WhatsAppSettingsBody() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const channel = useWhatsAppChannel();
  const action = useWhatsAppAction();

  let body: React.ReactNode;
  if (isFailed(channel)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(channel))}
        onRetry={() => void channel.refetch()}
      />
    );
  } else if (channel.isPending) {
    body = <ListSkeleton rows={2} />;
  } else {
    const c = channel.data;
    const key = whatsAppStatusKey(c);
    const isOn = key === 'live';
    const canToggle = canManage && (key === 'live' || key === 'paused');
    body = (
      <>
        <Group className="mt-5">
          <GroupRow
            title={t('settings.whatsapp.title')}
            subtitle={t(`settings.whatsapp.state.${key}`, {
              phone: formatPhone(c.display_phone ?? ''),
            })}
            trailing={
              canToggle ? (
                <Switch
                  checked={isOn}
                  disabled={action.isPending}
                  onCheckedChange={(on) =>
                    action.mutate(on ? 'resume' : 'pause')
                  }
                  accessibilityLabel={t('settings.whatsapp.bookingSwitch')}
                />
              ) : undefined
            }
          />
          {c.connected ? (
            <GroupRow
              showSeparator
              title={t('settings.whatsapp.detailsRow')}
              onPress={() => router.push('/settings/whatsapp-detail' as never)}
            />
          ) : null}
        </Group>
        <Text className="mx-5 mt-3 text-meta text-muted-foreground">
          {t(`settings.whatsapp.footer.${key}`, {
            phone: formatPhone(c.display_phone ?? ''),
          })}
        </Text>
      </>
    );
  }

  return (
    <Page
      title={t('settings.whatsapp.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {body}
    </Page>
  );
}

/** Settings > WhatsApp > details: health, what customers see, test message, disconnect. */
export function WhatsAppDetailScreen() {
  return (
    <Gate feature="whatsapp_menu">
      <WhatsAppDetailBody />
    </Gate>
  );
}

function WhatsAppDetailBody() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useCanManage();
  const channel = useWhatsAppChannel();
  const business = useBusinessDetails();
  const action = useWhatsAppAction();
  const test = useSendTestMessage({
    onSuccess: () => toast.success(t('settings.whatsapp.testSent')),
  });
  const [confirmOff, setConfirmOff] = React.useState(false);

  let body: React.ReactNode;
  if (isFailed(channel)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(loadError(channel))}
        onRetry={() => void channel.refetch()}
      />
    );
  } else if (channel.isPending) {
    body = <ListSkeleton rows={3} />;
  } else {
    const c = channel.data;
    const phone = formatPhone(c.display_phone ?? '');
    const ownerPhone = business.data?.phone ?? null;
    body = (
      <>
        <Group className="mt-5">
          <GroupRow
            title={t(`settings.whatsapp.state.${whatsAppStatusKey(c)}`, {
              phone,
            })}
            subtitle={phone}
          />
          {c.quality_rating ? (
            <GroupRow
              showSeparator
              title={t('settings.whatsapp.quality')}
              detail={c.quality_rating}
            />
          ) : null}
          {c.messaging_limit ? (
            <GroupRow
              showSeparator
              title={t('settings.whatsapp.limit')}
              detail={c.messaging_limit}
            />
          ) : null}
        </Group>
        {c.last_error ? (
          <Text
            accessibilityRole="alert"
            className="mx-5 mt-3 text-subtitle text-destructive"
          >
            {c.last_error}
          </Text>
        ) : null}

        <SectionTitle>{t('settings.whatsapp.customersSee')}</SectionTitle>
        <Group>
          {['book', 'bookings', 'talk'].map((id, i) => (
            <GroupRow
              key={id}
              showSeparator={i > 0}
              title={t(`settings.whatsapp.menu.${id}`)}
            />
          ))}
        </Group>

        {c.templates.length > 0 ? (
          <>
            <SectionTitle>{t('settings.whatsapp.templates')}</SectionTitle>
            <Group>
              {c.templates.map((tpl, i) => (
                <GroupRow
                  key={tpl.id}
                  showSeparator={i > 0}
                  title={tpl.name}
                  detail={t(`settings.whatsapp.templateStatus.${tpl.status}`)}
                />
              ))}
            </Group>
          </>
        ) : null}

        {canManage ? (
          <View className="mx-5 mt-6 gap-3">
            {ownerPhone ? (
              <Button
                variant="secondary"
                size="lg"
                disabled={test.isPending}
                onPress={() => test.mutate(ownerPhone)}
              >
                <Text className="text-title">
                  {t('settings.whatsapp.sendTest')}
                </Text>
              </Button>
            ) : (
              <Text className="text-subtitle text-muted-foreground">
                {t('settings.whatsapp.testNeedsPhone')}
              </Text>
            )}
            <Button
              variant="secondary"
              size="lg"
              disabled={action.isPending}
              onPress={() => action.mutate('sync')}
            >
              <Text className="text-title">{t('settings.whatsapp.sync')}</Text>
            </Button>
            <Button
              variant="outline-destructive"
              size="lg"
              onPress={() => setConfirmOff(true)}
            >
              <Text className="text-title">
                {t('settings.whatsapp.disconnect')}
              </Text>
            </Button>
          </View>
        ) : null}
        <ConfirmDialog
          open={confirmOff}
          onOpenChange={setConfirmOff}
          destructive
          title={t('settings.whatsapp.disconnectTitle')}
          description={t('settings.whatsapp.disconnectBody', { phone })}
          confirmLabel={t('settings.whatsapp.disconnectConfirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            action.mutate('disconnect');
            router.back();
          }}
        />
      </>
    );
  }

  return (
    <Page
      title={t('settings.whatsapp.detailTitle')}
      backLabel={t('settings.whatsapp.title')}
      backFallback="/settings/whatsapp"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {body}
    </Page>
  );
}
