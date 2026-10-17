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
import { useMe } from '@/features/business/me';

import {
  appVersionLabel,
  SETTINGS_ROUTES,
  settingsGroups,
  type SettingsItem,
} from '../navigation';
import { useSettingsRows } from '../useSettingsRows';
import { CompanionGlyph } from './CompanionGlyph';

const GLYPH_FOR: Record<SettingsItem, GlyphComponent> = {
  businessDetails: GLYPHS.store,
  hours: GLYPHS.clock,
  services: GLYPHS.scissors,
  rules: GLYPHS.sliders,
  team: GLYPHS.team,
  clovie: CompanionGlyph,
  whatsapp: GLYPHS.chat,
  notifications: GLYPHS.bell,
  plan: GLYPHS.card,
  appearance: GLYPHS.moon,
  deleteAccount: GLYPHS.trash,
};

/**
 * Settings: the business and the role, then one list for everyone (owner or
 * staff), Sign out and the app version. The role decides what can be changed,
 * never what is listed: a row that cannot be used is dimmed with its reason.
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const depth = useDepth();
  const signOut = useSignOut();
  const { user } = useUser();
  const { organization } = useOrganization();
  const me = useMe();
  const rows = useSettingsRows();
  const { isDark, toggle } = useAppColorScheme();
  const userName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || '';
  const title = organization?.name ?? userName;
  const role = me.data ? t(`settings.roles.${me.data.role}`) : '';

  const renderRow = (item: SettingsItem, index: number) => {
    const row = rows[item];
    const common = {
      showSeparator: index > 0,
      icon: GLYPH_FOR[item],
      title: t(`settings.items.${item}`),
    };
    if (item === 'appearance') {
      return (
        <GroupRow
          {...common}
          trailing={
            <Switch
              checked={isDark}
              onCheckedChange={toggle}
              accessibilityLabel={t('settings.items.appearance')}
            />
          }
        />
      );
    }
    return (
      <GroupRow
        {...common}
        detail={row.detail}
        detailTone={row.tone}
        disabled={row.disabled}
        reason={row.reason}
        destructive={item === 'deleteAccount'}
        onPress={() => router.push(SETTINGS_ROUTES[item] as never)}
      />
    );
  };

  return (
    <Page title={t('settings.title')} isTab>
      <Pressable
        onPress={() => router.push(SETTINGS_ROUTES.businessDetails as never)}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${role}`}
      >
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
          <ChevronRight
            size={14}
            strokeWidth={2.8}
            color={depth.colors.secondary}
          />
        </View>
      </Pressable>

      {settingsGroups().map((group, index) => (
        <Reveal key={group.id} scope="settings" index={index}>
          <SectionTitle>{t(`settings.groups.${group.id}`)}</SectionTitle>
          <Group radius={26}>
            {group.items.map((item, i) => (
              <React.Fragment key={item}>{renderRow(item, i)}</React.Fragment>
            ))}
          </Group>
        </Reveal>
      ))}

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
