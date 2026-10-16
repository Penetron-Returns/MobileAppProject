import {
  Avatar,
  GLYPHS,
  Group,
  GroupRow,
  Page,
  Pressable,
  SectionTitle,
  Switch,
  Text,
  useAppColorScheme,
  useDepth,
  type GlyphComponent,
  Reveal,
} from '@booking/ui';
import { useOrganization, useUser } from '@clerk/expo';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useSignOut } from '@/features/auth/useSignOut';
import { useWhatsAppAccount } from '@/features/business/hooks';
import { useMe } from '@/features/business/me';
import { useServices, useStaff } from '@/features/catalog/hooks';
import { isSupported as isVoiceSupported } from '@/features/voice/clovieVoice';
import { Gate } from '@/features/plans/components/Gate';
import { useAppMode, useEntitlements } from '@/features/plans/hooks';

import { CompanionGlyph } from './CompanionGlyph';
import {
  appVersionLabel,
  settingsGroups,
  type SettingsGroup,
  type SettingsItem,
} from '../navigation';

const GLYPH_FOR: Record<SettingsItem, GlyphComponent> = {
  businessDetails: GLYPHS.store,
  hours: GLYPHS.clock,
  services: GLYPHS.scissors,
  team: GLYPHS.team,
  rules: GLYPHS.sliders,
  attendance: GLYPHS.team,
  whatsapp: GLYPHS.chat,
  companion: CompanionGlyph,
  voice: GLYPHS.chat,
  plan: GLYPHS.card,
  notifications: GLYPHS.bell,
  deleteAccount: GLYPHS.team,
};

const ROUTES: Record<SettingsItem, string> = {
  businessDetails: '/settings/business-details',
  hours: '/settings/operating-hours',
  services: '/settings/services',
  team: '/settings/team',
  rules: '/settings/booking-rules',
  attendance: '/settings/attendance',
  whatsapp: '/settings/whatsapp',
  companion: '/settings/companion',
  voice: '/settings/voice',
  plan: '/settings/plan',
  notifications: '/settings/notifications',
  deleteAccount: '/settings/delete-account',
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

/**
 * Settings, per the board: the business (or the person, for staff), then the
 * groups the role may open, Sign out and the app version. Staff see only
 * Notifications; the API refuses the rest anyway.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const depth = useDepth();
  const signOut = useSignOut();
  const { user } = useUser();
  const { organization } = useOrganization();
  const me = useMe();
  const services = useServices();
  const staff = useStaff();
  const whatsapp = useWhatsAppAccount();
  const mode = useAppMode();
  const entitlements = useEntitlements();
  const { isDark, toggle } = useAppColorScheme();
  const isOwner = me.data?.role !== 'staff';
  const userName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || '';
  const title = isOwner ? (organization?.name ?? userName) : userName;
  const role = me.data ? t(`settings.roles.${me.data.role}`) : '';

  const details: Partial<Record<SettingsItem, string>> = {
    services: services.data ? String(services.data.length) : undefined,
    team: staff.data ? String(staff.data.length) : undefined,
    whatsapp: whatsappDetail(t, whatsapp.data),
    plan: entitlements.plan ? t(`plans.names.${entitlements.plan}`) : undefined,
  };

  const renderGroup = (group: SettingsGroup, index: number) => {
    const content = (
      <Reveal key={group.id} scope="settings" index={index}>
        {group.titled ? (
          <SectionTitle>{t(`settings.groups.${group.id}`)}</SectionTitle>
        ) : (
          <View className="mt-7" />
        )}
        <Group radius={26}>
          {group.items.map((item, i) => (
            <GroupRow
              key={item}
              showSeparator={i > 0}
              icon={GLYPH_FOR[item]}
              title={t(`settings.items.${item}`)}
              detail={details[item]}
              detailTone={
                item === 'whatsapp' && whatsapp.data?.status === 'live'
                  ? 'success'
                  : 'secondary'
              }
              onPress={() => router.push(ROUTES[item] as never)}
            />
          ))}
          {group.id === 'account' && isOwner ? (
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
      </Reveal>
    );
    // Our own WhatsApp booking menu is a Free-plan feature; paid plans show the Companion row instead.
    return group.id === 'customize' && mode === 'free' ? (
      <Gate key={group.id} feature="whatsapp_menu">
        {content}
      </Gate>
    ) : (
      content
    );
  };

  const profile = (
    <View className="mx-5 mt-4 min-h-[72px] flex-row items-center gap-3.5">
      <Avatar name={title} size="lg" tone="tint" />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="text-[20px] font-semibold leading-[25px]"
        >
          {title}
        </Text>
        <Text className="text-subtitle text-muted-foreground">{role}</Text>
      </View>
      {isOwner ? (
        <ChevronRight
          size={14}
          strokeWidth={2.8}
          color={depth.colors.secondary}
        />
      ) : null}
    </View>
  );

  return (
    <Page title={t('settings.title')} isTab>
      {isOwner ? (
        <Pressable
          onPress={() => router.push(ROUTES.businessDetails as never)}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${role}`}
        >
          {profile}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${title}, ${role}`}>
          {profile}
        </View>
      )}

      {settingsGroups(isOwner, mode, { hasVoice: isVoiceSupported() }).map(
        (group, index) => renderGroup(group, index),
      )}

      <Pressable
        onPress={() => void signOut()}
        accessibilityRole="button"
        accessibilityLabel={t('common.signOut')}
        className="mx-5 mt-5 min-h-[52px] items-center justify-center"
      >
        <Text
          style={{ color: depth.colors.destructiveText }}
          className="text-title"
        >
          {t('common.signOut')}
        </Text>
      </Pressable>
      <Text className="mx-5 mt-1 text-center text-meta text-muted-foreground">
        {appVersionLabel(
          t('auth.appName'),
          Constants.expoConfig?.version ?? '',
          Constants.nativeBuildVersion ?? null,
        )}
      </Text>
    </Page>
  );
}

function whatsappDetail(
  t: Translate,
  account: { status: string; display_phone: string | null } | null | undefined,
): string | undefined {
  if (account === undefined) return undefined;
  return t(`settings.whatsapp.rowStatus.${account?.status ?? 'none'}`);
}
