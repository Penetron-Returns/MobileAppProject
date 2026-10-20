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
  useHapticsEnabled,
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
import { useSettingsRows, type RowModel } from '../useSettingsRows';

const GLYPH_FOR: Record<SettingsItem, GlyphComponent> = {
  businessDetails: GLYPHS.store,
  hours: GLYPHS.clock,
  services: GLYPHS.scissors,
  rules: GLYPHS.sliders,
  team: GLYPHS.team,
  whatsapp: GLYPHS.chat,
  notifications: GLYPHS.bell,
  appearance: GLYPHS.moon,
  haptics: GLYPHS.sliders,
  deleteAccount: GLYPHS.trash,
};

interface SettingsRowProps {
  item: SettingsItem;
  index: number;
  detail?: string;
  tone?: RowModel['tone'];
  disabled?: boolean;
  reason?: string;
}

/** Memoised on its primitive props: a query landing re-renders only the rows it changed. */
const SettingsRow = React.memo(function SettingsRow({
  item,
  index,
  detail,
  tone,
  disabled,
  reason,
}: SettingsRowProps) {
  const { t } = useTranslation();
  const common = {
    showSeparator: index > 0,
    icon: GLYPH_FOR[item],
    title: t(`settings.items.${item}`),
  };
  if (item === 'appearance') return <AppearanceRow {...common} />;
  if (item === 'haptics') return <HapticsRow {...common} />;
  return (
    <GroupRow
      {...common}
      detail={detail}
      detailTone={tone}
      disabled={disabled}
      reason={reason}
      destructive={item === 'deleteAccount'}
      onPress={() => router.push(SETTINGS_ROUTES[item] as never)}
    />
  );
});

const AppearanceRow = React.memo(function AppearanceRow(
  props: React.ComponentProps<typeof GroupRow>,
) {
  const { t } = useTranslation();
  const { isDark, toggle } = useAppColorScheme();
  return (
    <GroupRow
      {...props}
      trailing={
        <Switch
          checked={isDark}
          onCheckedChange={toggle}
          accessibilityLabel={t('settings.items.appearance')}
        />
      }
    />
  );
});

const HapticsRow = React.memo(function HapticsRow(
  props: React.ComponentProps<typeof GroupRow>,
) {
  const { t } = useTranslation();
  const [isOn, setOn] = useHapticsEnabled();
  return (
    <GroupRow
      {...props}
      trailing={
        <Switch
          checked={isOn}
          onCheckedChange={setOn}
          accessibilityLabel={t('settings.items.haptics')}
        />
      }
    />
  );
});

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
  const userName =
    user?.fullName || user?.primaryEmailAddress?.emailAddress || '';
  const title = organization?.name ?? userName;
  const role = me.data ? t(`settings.roles.${me.data.role}`) : '';

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
              <SettingsRow
                key={item}
                item={item}
                index={i}
                detail={rows[item].detail}
                tone={rows[item].tone}
                disabled={rows[item].disabled}
                reason={rows[item].reason}
              />
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
