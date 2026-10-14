import {
  Avatar,
  Capsule,
  ErrorState,
  Group,
  GroupRow,
  ListSkeleton,
  Page,
  SectionTitle,
  Surface,
  Switch,
  Text,
  useDepth,
} from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Calendar, UserX, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { useBusiness } from '@/features/business/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { formatPhone } from '@/lib/format';
import { formatDateMedium, businessDate } from '@/lib/time';
import { toast, describeError } from '@/lib/toast';

import { useClient, useUpdateClient, type ClientProfile } from '../hooks';
import { VIP_TAG } from '../logic';
import { ClientHistory } from './ClientHistory';
import { ClientNotesCard } from './ClientNotesCard';

function openUrl(url: string, fallback: string) {
  Linking.openURL(url).catch(() => toast.info(fallback));
}

/** Client profile: contact, up next, history, notes. */
export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const business = useBusiness();
  const client = useClient(clientId);

  let body: React.ReactNode;
  if (isFailed(client) || isFailed(business)) {
    body = (
      <ErrorState
        variant="banner"
        {...describeError(
          isFailed(client) ? loadError(client) : loadError(business),
        )}
        onRetry={() => {
          void client.refetch();
          void business.refetch();
        }}
      />
    );
  } else if (client.isPending || !business.data) {
    body = <ListSkeleton rows={3} />;
  } else if (!client.data) {
    body = (
      <View className="items-center px-10 pt-16">
        <UserX size={30} strokeWidth={1.8} />
        <Text className="mt-3 text-center text-section font-bold">
          {t('clients.profile.notFound')}
        </Text>
      </View>
    );
  } else {
    body = (
      <ProfileBody
        client={client.data}
        timezone={business.data.timezone}
        currency={business.data.currency}
      />
    );
  }

  return (
    <Page
      title={
        client.data
          ? (client.data.name ?? formatPhone(client.data.phone_e164))
          : ' '
      }
      backLabel={t('clients.title')}
      backFallback="/clients"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      <SavedCopyBanner query={client} timezone={business.data?.timezone} />
      {body}
    </Page>
  );
}

function ProfileBody({
  client,
  timezone,
  currency,
}: {
  client: ClientProfile;
  timezone: string;
  currency: string;
}) {
  const { t } = useTranslation();
  const name = client.name ?? formatPhone(client.phone_e164);
  const firstName = name.split(' ')[0];
  const joined = formatDateMedium(businessDate(client.first_seen_at, timezone));
  const update = useUpdateClient(client.id);

  return (
    <>
      <View className="mx-5 mt-2 flex-row items-center gap-3">
        <Avatar name={name} size="xl" />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-subtitle text-muted-foreground">
            {t('clients.profile.since', { date: joined })}
          </Text>
          {client.tags.includes(VIP_TAG) ? (
            <Capsule label={t('clients.vip')} className="self-start" />
          ) : null}
        </View>
      </View>

      <View className="mx-5 mt-5 flex-row gap-3">
        <Action
          icon={Calendar}
          label={t('clients.profile.book')}
          spoken={t('clients.profile.bookLabel', { name: firstName })}
          onPress={() =>
            router.push({
              pathname: '/add',
              params: { clientId: client.id },
            } as never)
          }
        />
      </View>

      <ClientHistory
        clientId={client.id}
        timezone={timezone}
        currency={currency}
      />
      <ClientNotesCard clientId={client.id} firstName={firstName} />

      <SectionTitle>{t('clients.profile.contact')}</SectionTitle>
      <Group>
        <GroupRow
          title={formatPhone(client.phone_e164)}
          subtitle={t('clients.profile.mobile')}
          onPress={() => openUrl(`tel:${client.phone_e164}`, client.phone_e164)}
          accessibilityLabel={t('clients.profile.callNumber', {
            phone: formatPhone(client.phone_e164),
          })}
        />
        {client.email ? (
          <GroupRow
            showSeparator
            title={client.email}
            subtitle={t('clients.profile.email')}
            onPress={() =>
              openUrl(`mailto:${client.email}`, client.email ?? '')
            }
          />
        ) : null}
        <GroupRow
          showSeparator
          title={t('clients.profile.optIn')}
          subtitle={
            client.whatsapp_opt_in
              ? t('clients.profile.optedIn')
              : t('clients.profile.optedOut')
          }
          trailing={
            <Switch
              checked={client.whatsapp_opt_in}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate({ whatsapp_opt_in: checked })
              }
              accessibilityLabel={t('clients.profile.optIn')}
            />
          }
        />
      </Group>
    </>
  );
}

function Action({
  icon: Glyph,
  label,
  spoken,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  spoken: string;
  onPress: () => void;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      className="min-h-12 flex-1"
    >
      {({ pressed }) => (
        <Surface
          variant="raised"
          radius={24}
          style={pressed ? depth.buttonPressed : undefined}
          className="h-12 flex-row items-center justify-center gap-2"
        >
          <Glyph size={20} strokeWidth={1.8} color={depth.colors.tint} />
          <Text
            style={{ color: depth.colors.tint }}
            className="text-title font-semibold"
          >
            {label}
          </Text>
        </Surface>
      )}
    </Pressable>
  );
}
