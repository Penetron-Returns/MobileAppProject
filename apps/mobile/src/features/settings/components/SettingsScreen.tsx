import { useClerk, useOrganization, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  LogOut,
  MessageCircle,
  Moon,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { PersonAvatar } from '@/components/PersonAvatar';
import { Screen } from '@/components/Screen';
import { TabHeader } from '@/components/TabHeader';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useWhatsAppAccount } from '@/features/business/hooks';
import { useCalendarConnection } from '@/features/calendar-sync/hooks';
import { useMe } from '@/features/business/me';
import { useAppColorScheme } from '@/hooks/useAppColorScheme';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

const BUSINESS_SETTINGS = [
  {
    id: 'businessDetails',
    icon: Building2,
    href: '/settings/business-details',
  },
  { id: 'operatingHours', icon: Clock, href: '/settings/operating-hours' },
  { id: 'services', icon: Sparkles, href: '/settings/services' },
  { id: 'staff', icon: Users, href: '/settings/staff-management' },
] as const;

export function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useClerk();
  return (
    <Screen header={<TabHeader />}>
      <View className="mx-auto w-full max-w-lg gap-5 sm:max-w-xl">
        <ProfileCard />
        <Card title={t('settings.preferences')}>
          <PreferencesList />
        </Card>
        <Card title={t('settings.businessSettings')}>
          {BUSINESS_SETTINGS.map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => router.push(item.href as never)}
              accessibilityRole="button"
              accessibilityLabel={t(`settings.items.${item.id}.title`)}
              className={cn(
                'active:bg-muted/50 min-h-[44px] flex-row items-center justify-between p-4',
                index < BUSINESS_SETTINGS.length - 1 &&
                  'border-border border-b',
              )}
            >
              <View className="flex-row items-center gap-3.5">
                <View className="bg-primary/10 h-10 w-10 items-center justify-center rounded-full">
                  <Icon as={item.icon} size={20} className="text-primary" />
                </View>
                <View>
                  <Text className="text-foreground text-base font-semibold">
                    {t(`settings.items.${item.id}.title`)}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {t(`settings.items.${item.id}.subtitle`)}
                  </Text>
                </View>
              </View>
              <Icon
                as={ChevronRight}
                size={20}
                className="text-muted-foreground/60"
              />
            </Pressable>
          ))}
        </Card>
        <Card title={t('settings.integrations')}>
          <WhatsAppStatus />
          <GoogleCalendarStatus />
        </Card>
        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel={t('settings.logOut')}
          className="border-destructive/40 active:bg-destructive/10 flex-row items-center justify-center gap-2 rounded-xl border py-3.5"
        >
          <Icon as={LogOut} size={18} className="text-destructive" />
          <Text className="text-destructive text-base font-semibold">
            {t('settings.logOut')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-card border-border overflow-hidden rounded-2xl border shadow-sm">
      <View className="border-border border-b px-5 py-3.5">
        <Text className="text-muted-foreground text-xs font-bold uppercase tracking-wider">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function ProfileCard() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { organization } = useOrganization();
  const me = useMe();
  const name =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress ||
    '';
  const role = me.data ? t(`settings.roles.${me.data.role}`) : null;
  const badge = [organization?.name, role].filter(Boolean).join(' • ');
  return (
    <View className="bg-card border-border items-center rounded-2xl border p-6 shadow-sm">
      <PersonAvatar
        name={name}
        imageUrl={user?.imageUrl}
        size="xl"
        className="mb-3"
      />
      <Text className="text-foreground text-xl font-bold">{name}</Text>
      <Text className="text-muted-foreground mt-0.5 text-sm">
        {user?.primaryEmailAddress?.emailAddress}
      </Text>
      {badge ? (
        <View className="bg-primary/10 mt-3 flex-row items-center gap-1.5 rounded-full px-3 py-1">
          <Icon as={ShieldCheck} size={14} className="text-primary" />
          <Text className="text-primary text-xs font-semibold">{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PreferencesList() {
  const { t } = useTranslation();
  const { isDark, toggle } = useAppColorScheme();
  return (
    <View className="gap-4 p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <View className="bg-muted h-10 w-10 items-center justify-center rounded-xl">
            <Icon as={Moon} size={20} className="text-muted-foreground" />
          </View>
          <View>
            <Text className="text-foreground text-base font-semibold">
              {t('settings.darkMode')}
            </Text>
            <Text className="text-muted-foreground text-xs">
              {t('settings.darkModeHint')}
            </Text>
          </View>
        </View>
        <Switch
          checked={isDark}
          onCheckedChange={toggle}
          accessibilityLabel={t('settings.darkMode')}
        />
      </View>
    </View>
  );
}

function WhatsAppStatus() {
  const { t } = useTranslation();
  const account = useWhatsAppAccount();
  const status = account.data?.status ?? null;
  const isLive = status === 'live';
  const detail = account.isPending
    ? t('settings.whatsapp.loading')
    : status
      ? t(`settings.whatsapp.status.${status}`, {
          phone: formatPhone(account.data?.display_phone ?? ''),
        })
      : t('settings.whatsapp.notConnected');
  return (
    <View className="p-4">
      <View className="border-border bg-muted/30 flex-row items-center gap-3 rounded-xl border p-4">
        <View className="bg-whatsapp/15 h-12 w-12 items-center justify-center rounded-full">
          <Icon as={MessageCircle} size={24} className="text-whatsapp" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-foreground text-base font-semibold">
              {t('settings.whatsapp.title')}
            </Text>
            <View
              className={cn(
                'h-2 w-2 rounded-full',
                isLive ? 'bg-success' : 'bg-muted-foreground/40',
              )}
            />
          </View>
          <Text className="text-muted-foreground text-xs">{detail}</Text>
        </View>
      </View>
    </View>
  );
}

function GoogleCalendarStatus() {
  const { t } = useTranslation();
  const router = useRouter();
  const connection = useCalendarConnection();
  const status = connection.data?.status ?? null;
  const detail = connection.isPending
    ? t('settings.googleCalendar.loading')
    : status === 'live'
      ? connection.data?.account_email
        ? t('settings.googleCalendar.status.live', {
            email: connection.data.account_email,
          })
        : t('settings.googleCalendar.status.liveNoEmail')
      : status
        ? t(`settings.googleCalendar.status.${status}`)
        : t('settings.googleCalendar.notConnected');
  return (
    <Pressable
      onPress={() => router.push('/settings/google-calendar' as never)}
      accessibilityRole="button"
      accessibilityLabel={t('settings.googleCalendar.title')}
      className="px-4 pb-4"
    >
      <View className="border-border bg-muted/30 active:bg-muted/60 flex-row items-center gap-3 rounded-xl border p-4">
        <View className="bg-primary/10 h-12 w-12 items-center justify-center rounded-full">
          <Icon as={CalendarDays} size={24} className="text-primary" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-foreground text-base font-semibold">
              {t('settings.googleCalendar.title')}
            </Text>
            <View
              className={cn(
                'h-2 w-2 rounded-full',
                status === 'live'
                  ? 'bg-success'
                  : status
                    ? 'bg-destructive'
                    : 'bg-muted-foreground/40',
              )}
            />
          </View>
          <Text className="text-muted-foreground text-xs">{detail}</Text>
        </View>
        <Icon
          as={ChevronRight}
          size={20}
          className="text-muted-foreground/60"
        />
      </View>
    </Pressable>
  );
}
