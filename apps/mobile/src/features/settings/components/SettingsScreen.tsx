import {
  Avatar,
  Group,
  GroupRow,
  Page,
  SectionTitle,
  Surface,
  Switch,
  Text,
  useAppColorScheme,
} from '@booking/ui';
import { useOrganization, useUser } from '@clerk/expo';
import { router } from 'expo-router';
import {
  Bell,
  Clock,
  MessageCircle,
  Scissors,
  SlidersHorizontal,
  Store,
  Users,
} from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useWhatsAppAccount } from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { Gate } from '@/features/plans/components/Gate';
import { useSignOut } from '@/features/auth/useSignOut';
import { formatPhone } from '@/lib/format';

import { settingsGroups } from '../navigation';

const ICONS = {
  businessDetails: Store,
  hours: Clock,
  services: Scissors,
  team: Users,
  rules: SlidersHorizontal,
  notifications: Bell,
} as const;

/** Settings: your business, WhatsApp, account. Staff only see their account. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const signOut = useSignOut();
  const { user } = useUser();
  const { organization } = useOrganization();
  const me = useMe();
  const { isDark, toggle } = useAppColorScheme();
  const isOwner = me.data?.role !== 'staff';
  const groups = settingsGroups(isOwner);
  const userName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || '';
  const title = isOwner ? (organization?.name ?? userName) : userName;
  const role = me.data ? t(`settings.roles.${me.data.role}`) : '';

  return (
    <Page title={t('settings.title')} isTab>
      <Pressable
        onPress={
          isOwner
            ? () => router.push('/settings/business-details' as never)
            : undefined
        }
        disabled={!isOwner}
        accessibilityRole={isOwner ? 'button' : 'text'}
        accessibilityLabel={`${title}, ${role}`}
        className="mt-4"
      >
        <Surface
          variant="raised"
          className="mx-5 min-h-[72px] flex-row items-center gap-3.5 px-4 py-3"
        >
          <Avatar name={title} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-title font-semibold">
              {title}
            </Text>
            <Text className="text-subtitle text-muted-foreground">{role}</Text>
          </View>
        </Surface>
      </Pressable>

      {groups.map((group) => (
        <React.Fragment key={group.id}>
          <SectionTitle>{t(`settings.groups.${group.id}`)}</SectionTitle>
          <Group>
            {group.items.map((item, i) => (
              <GroupRow
                key={item}
                showSeparator={i > 0}
                icon={ICONS[item]}
                title={t(`settings.items.${item}`)}
                onPress={() => router.push(ROUTES[item] as never)}
              />
            ))}
            {group.id === 'account' ? (
              <GroupRow
                showSeparator
                title={t('settings.darkMode')}
                trailing={
                  <Switch
                    checked={isDark}
                    onCheckedChange={toggle}
                    accessibilityLabel={t('settings.darkMode')}
                  />
                }
              />
            ) : null}
          </Group>
          {/* Our own WhatsApp booking menu is a Free-plan feature. */}
          {group.id === 'business' && isOwner ? (
            <Gate feature="whatsapp_menu">
              <WhatsAppRow />
            </Gate>
          ) : null}
        </React.Fragment>
      ))}

      <Pressable
        onPress={() => void signOut()}
        accessibilityRole="button"
        accessibilityLabel={t('common.signOut')}
        className="mx-5 mt-7 min-h-12 items-center justify-center active:opacity-50"
      >
        <Text className="text-title text-destructive">
          {t('common.signOut')}
        </Text>
      </Pressable>
    </Page>
  );
}

const ROUTES = {
  businessDetails: '/settings/business-details',
  hours: '/settings/operating-hours',
  services: '/settings/services',
  team: '/settings/staff-management',
  rules: '/settings/booking-rules',
  notifications: '/settings/notifications',
} as const;

function WhatsAppRow() {
  const { t } = useTranslation();
  const account = useWhatsAppAccount();
  const status = account.data?.status ?? null;
  const detail = status
    ? t(`settings.whatsapp.status.${status}`, {
        phone: formatPhone(account.data?.display_phone ?? ''),
      })
    : t('settings.whatsapp.notConnected');
  return (
    <>
      <SectionTitle>{t('settings.groups.whatsapp')}</SectionTitle>
      <Group>
        <GroupRow
          icon={MessageCircle}
          title={t('settings.whatsapp.title')}
          detail={detail}
          detailTone={status === 'live' ? 'success' : 'secondary'}
          onPress={() => router.push('/settings/whatsapp' as never)}
        />
      </Group>
    </>
  );
}
