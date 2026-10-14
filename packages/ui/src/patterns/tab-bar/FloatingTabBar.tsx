import type { Tabs } from 'expo-router';
import {
  CalendarDays,
  Plus,
  SlidersHorizontal,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../../primitives/Text';
import { type DepthTokens } from '../../tokens/depth';
import { useDepth } from '../../theme/useDepth';

import {
  INBOX_DOME_GAP,
  INBOX_DOME_SIZE,
  LEFT_TABS,
  RIGHT_TABS,
  TAB_BAR_HEIGHT,
  tabBarBottomOffset,
  type TabRouteName,
} from './layout';
import { useDsText } from '../../lib/strings';

const TAB_ICONS: Record<TabRouteName, LucideIcon> = {
  index: Sun,
  calendar: CalendarDays,
  clients: Users,
  settings: SlidersHorizontal,
};

// expo-router bundles its own react-navigation, so take the props type from it.
type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

const PRESSED_NUDGE = { transform: [{ translateY: 1 }] } as const;

/**
 * The floating tab bar of the iPhone design: Today · Calendar · + · Clients ·
 * Settings in one raised capsule, a tactile centre "+" that opens a new
 * booking, and the Inbox dome above the right-hand end. Hidden on pushed
 * detail screens, which opt out through `tabBarStyle: { display: 'none' }`.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  inbox,
}: TabBarProps & {
  /** The Inbox dome (or nothing) shown above the right-hand end of the bar. */
  inbox?: React.ReactNode;
}) {
  const t = useDsText();
  const depth = useDepth();
  const insets = useSafeAreaInsets();

  const current = state.routes[state.index];
  const currentStyle = StyleSheet.flatten(
    descriptors[current.key]?.options.tabBarStyle as ViewStyle | undefined,
  );
  if (currentStyle?.display === 'none') return null;

  const goTo = (name: string, key?: string) => {
    const event = key
      ? navigation.emit({
          type: 'tabPress',
          target: key,
          canPreventDefault: true,
        })
      : { defaultPrevented: false };
    if (!event.defaultPrevented) navigation.navigate(name);
  };

  const renderTab = (name: TabRouteName) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    return (
      <TabItem
        key={name}
        icon={TAB_ICONS[name]}
        label={t(`tabs.${name === 'index' ? 'today' : name}`)}
        isActive={current.name === name}
        depth={depth}
        onPress={() => goTo(name, route.key)}
      />
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: tabBarBottomOffset(insets.bottom),
        height: TAB_BAR_HEIGHT + INBOX_DOME_GAP + INBOX_DOME_SIZE,
      }}
    >
      <View
        pointerEvents="box-none"
        className="absolute right-5 top-0 items-end"
      >
        {inbox}
      </View>
      <View
        accessibilityRole="tablist"
        style={[
          depth.bar,
          {
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 0,
            height: TAB_BAR_HEIGHT,
            borderRadius: TAB_BAR_HEIGHT / 2,
          },
        ]}
        className="flex-row items-stretch p-1"
      >
        {LEFT_TABS.map(renderTab)}
        <Pressable
          onPress={() => goTo('add')}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.add')}
          className="w-[60px] items-center justify-center"
        >
          {({ pressed }) => (
            <View
              style={[
                depth.primary,
                pressed && depth.primaryPressed,
                pressed && PRESSED_NUDGE,
              ]}
              className="h-[52px] w-[52px] items-center justify-center rounded-full"
            >
              <Plus size={26} strokeWidth={2.4} color="#FFFFFF" />
            </View>
          )}
        </Pressable>
        {RIGHT_TABS.map(renderTab)}
      </View>
    </View>
  );
}

function TabItem({
  icon: IconGlyph,
  label,
  isActive,
  depth,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  depth: DepthTokens;
  onPress: () => void;
}) {
  const color = isActive ? depth.colors.tint : depth.colors.inactive;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      style={isActive ? [depth.pill, { borderRadius: 28 }] : undefined}
      className="min-w-0 flex-1 items-center justify-center gap-px"
    >
      <IconGlyph size={24} strokeWidth={isActive ? 2.2 : 1.8} color={color} />
      <Text
        numberOfLines={1}
        style={{ color }}
        className={
          isActive
            ? 'text-[11px] font-semibold leading-[13px]'
            : 'text-[11px] font-medium leading-[13px]'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
