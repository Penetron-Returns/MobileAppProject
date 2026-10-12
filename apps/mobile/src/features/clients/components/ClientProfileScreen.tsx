import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Calendar,
  Mail,
  MessageCircle,
  Phone,
  Smartphone,
  UserX,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, View } from 'react-native';

import { Header } from '@/components/Header';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, LoadingCard } from '@/components/States';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import type { BusinessSummary } from '@/features/business/hooks';
import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { formatPhone } from '@/lib/format';
import { businessDate, formatDateMedium } from '@/lib/time';
import { toast } from '@/lib/toast';

import { useClient, type ClientProfile } from '../hooks';
import { ClientHistory } from './ClientHistory';
import { ClientNotesCard } from './ClientNotesCard';

export function ClientProfileScreen({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (
    <Screen
      header={
        <Header title={t('clientProfile.title')} fallbackHref="/clients" />
      }
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      <BusinessGate>
        {(business) => (
          <ProfileContent clientId={clientId} business={business} />
        )}
      </BusinessGate>
    </Screen>
  );
}

function ProfileContent({
  clientId,
  business,
}: {
  clientId: string;
  business: BusinessSummary;
}) {
  const { t } = useTranslation();
  const client = useClient(clientId);
  if (client.isPending) return <LoadingCard />;
  if (client.isError) {
    return (
      <ErrorState error={client.error} onRetry={() => void client.refetch()} />
    );
  }
  if (!client.data) {
    return <EmptyState icon={UserX} title={t('clientProfile.notFound')} />;
  }
  return (
    <View className="mx-auto w-full max-w-lg gap-6 pb-8 sm:max-w-2xl md:max-w-4xl">
      <ProfileCard client={client.data} timezone={business.timezone} />
      <ContactCard client={client.data} />
      <ClientNotesCard clientId={clientId} />
      <ClientHistory
        clientId={clientId}
        timezone={business.timezone}
        currency={business.currency}
      />
    </View>
  );
}

function openUrl(url: string, fallback: string) {
  Linking.openURL(url).catch(() => toast.info(fallback));
}

function ProfileCard({
  client,
  timezone,
}: {
  client: ClientProfile;
  timezone: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const name = client.name ?? formatPhone(client.phone_e164);
  const joined = formatDateMedium(businessDate(client.first_seen_at, timezone));
  return (
    <View className="bg-card border-border relative overflow-hidden rounded-2xl border p-6 shadow-sm">
      <View className="bg-primary/10 pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full" />
      <View className="relative z-10 items-center gap-4 sm:flex-row sm:items-start">
        <PersonAvatar name={name} size="xl" />
        <View className="flex-1 items-center sm:items-start">
          <Text className="text-foreground text-center text-2xl font-bold tracking-tight sm:text-left">
            {name}
          </Text>
          <Text className="text-muted-foreground mt-0.5 text-sm">
            {t('clientProfile.joined', { date: joined })}
          </Text>
          <View className="mt-4 flex-row flex-wrap justify-center gap-2.5 sm:justify-start">
            <ActionButton
              icon={MessageCircle}
              label={t('clientProfile.message')}
              variant="whatsapp"
              onPress={() =>
                openUrl(
                  whatsAppChatUrl(client.phone_e164, ''),
                  t('dashboard.openingWhatsApp', { name }),
                )
              }
            />
            <ActionButton
              icon={Phone}
              label={t('clientProfile.call')}
              variant="primary"
              onPress={() =>
                openUrl(`tel:${client.phone_e164}`, client.phone_e164)
              }
            />
            <ActionButton
              icon={Calendar}
              label={t('clientProfile.book')}
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: '/add',
                  params: { clientId: client.id },
                } as never)
              }
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const ACTION_STYLES = {
  whatsapp: { box: 'bg-whatsapp', text: 'text-white' },
  primary: { box: 'bg-primary', text: 'text-primary-foreground' },
  outline: { box: 'bg-card border-border border', text: 'text-foreground' },
} as const;

function ActionButton({
  icon,
  label,
  variant,
  onPress,
}: {
  icon: typeof Phone;
  label: string;
  variant: keyof typeof ACTION_STYLES;
  onPress: () => void;
}) {
  const s = ACTION_STYLES[variant];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`${s.box} min-h-[44px] flex-row items-center gap-2 rounded-xl px-4 py-2.5 shadow-sm active:opacity-90`}
    >
      <Icon as={icon} size={18} className={s.text} />
      <Text className={`${s.text} text-sm font-semibold`}>{label}</Text>
    </Pressable>
  );
}

function ContactCard({ client }: { client: ClientProfile }) {
  const { t } = useTranslation();
  return (
    <View className="bg-card border-border rounded-2xl border p-5 shadow-sm">
      <View className="mb-4 flex-row items-center gap-2">
        <Icon as={Smartphone} size={20} className="text-primary" />
        <Text className="text-foreground text-lg font-bold">
          {t('clientProfile.contact')}
        </Text>
      </View>
      <View className="gap-3">
        <ContactRow
          icon={Smartphone}
          label={t('clientProfile.mobile')}
          value={formatPhone(client.phone_e164)}
          onPress={() => openUrl(`tel:${client.phone_e164}`, client.phone_e164)}
        />
        {client.email ? (
          <ContactRow
            icon={Mail}
            label={t('clientProfile.email')}
            value={client.email}
            onPress={() =>
              openUrl(`mailto:${client.email}`, client.email ?? '')
            }
          />
        ) : null}
      </View>
    </View>
  );
}

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      className="active:bg-muted/50 flex-row items-center gap-3 rounded-xl p-2"
    >
      <View className="bg-muted h-10 w-10 items-center justify-center rounded-full">
        <Icon as={icon} size={18} className="text-foreground" />
      </View>
      <View className="flex-1">
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
          {label}
        </Text>
        <Text className="text-foreground text-base font-medium">{value}</Text>
      </View>
    </Pressable>
  );
}
