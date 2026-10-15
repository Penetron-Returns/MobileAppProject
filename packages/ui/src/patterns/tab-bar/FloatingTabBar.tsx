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
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightHaptic } from '../../lib/haptics';
import { Text } from '../../primitives/Text';
import { type DepthTokens } from '../../tokens/depth';
import { useDepth } from '../../theme/useDepth';
import {
  DURATION,
  SCALE,
  springConfig,
  timingConfig,
} from '../../tokens/motion';

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
import { usePressBounce } from './usePressBounce';

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

/** Position of a tab inside the capsule, measured on layout. */
interface TabFrame {
  x: number;
  width: number;
}

/** Inset of the tabs inside the capsule (p-1): the pill sits within it. */
const BAR_PAD = 4;

/**
 * The floating tab bar of the iPhone design: Today, Calendar, +, Clients,
 * Settings in one raised capsule, a tactile centre "+" that calls `onAdd`
 * (the app opens New booking as a modal), and the Inbox dome above the right-hand end. Hidden on screens
 * that opt out through `tabBarStyle: { display: 'none' }`. The selected pill
 * slides between tabs, the tapped icon pops and a light haptic confirms the
 * change.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  inbox,
  onAdd,
}: TabBarProps & {
  /** Opens New booking; a modal route, so the bar has no "add" tab to switch to. */
  onAdd?: () => void;
  /** The Inbox dome (or nothing) shown above the right-hand end of the bar. */
  inbox?: React.ReactNode;
}) {
  const t = useDsText();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  const addBounce = usePressBounce();
  const [frames, setFrames] = React.useState<
    Partial<Record<TabRouteName, TabFrame>>
  >({});

  const current = state.routes[state.index];
  const activeName = current.name as string;
  const activeFrame = frames[activeName as TabRouteName];
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const pillOn = useSharedValue(0);
  const placed = React.useRef(false);
  React.useEffect(() => {
    if (!activeFrame) {
      pillOn.value = withTiming(0, timingConfig(DURATION.quick));
      return;
    }
    if (!placed.current) {
      // First placement lands without sliding in from the left edge.
      placed.current = true;
      pillX.value = activeFrame.x;
      pillW.value = activeFrame.width;
    } else {
      pillX.value = withSpring(activeFrame.x, springConfig('snappy'));
      pillW.value = withSpring(activeFrame.width, springConfig('snappy'));
    }
    pillOn.value = withTiming(1, timingConfig(DURATION.quick));
  }, [activeFrame, pillOn, pillW, pillX]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOn.value,
    width: pillW.value,
    transform: [{ translateX: pillX.value }],
  }));

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
    if (!event.defaultPrevented) {
      if (name !== activeName) lightHaptic();
      navigation.navigate(name);
    }
  };

  const onFrame = (name: TabRouteName) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setFrames((prev) =>
      prev[name]?.x === x && prev[name]?.width === width
        ? prev
        : { ...prev, [name]: { x, width } },
    );
  };

  const renderTab = (name: TabRouteName) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    return (
      <TabItem
        key={name}
        icon={TAB_ICONS[name]}
        label={t(`tabs.${name === 'index' ? 'today' : name}`)}
        isActive={activeName === name}
        depth={depth}
        onPress={() => goTo(name, route.key)}
        onLayout={onFrame(name)}
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
        <Animated.View
          pointerEvents="none"
          style={[
            depth.pill,
            {
              position: 'absolute',
              top: BAR_PAD,
              bottom: BAR_PAD,
              left: 0,
              borderRadius: 28,
            },
            pillStyle,
          ]}
        />
        {LEFT_TABS.map(renderTab)}
        <Pressable
          onPress={() => {
            lightHaptic();
            onAdd?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.add')}
          {...addBounce.handlers}
          className="w-[60px] items-center justify-center"
        >
          {({ pressed }) => (
            <Animated.View
              style={[
                depth.primary,
                pressed && depth.primaryPressed,
                addBounce.style,
              ]}
              className="h-[52px] w-[52px] items-center justify-center rounded-full"
            >
              <Plus size={26} strokeWidth={2.4} color={depth.colors.onFill} />
            </Animated.View>
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
  onLayout,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  depth: DepthTokens;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const color = isActive ? depth.colors.tint : depth.colors.inactive;
  // The icon pops (scale 1, 1.12, 1) each time its tab becomes the selected one.
  const pop = useSharedValue(1);
  const wasActive = React.useRef(isActive);
  React.useEffect(() => {
    if (isActive && !wasActive.current) {
      pop.value = withSequence(
        withSpring(SCALE.pop, springConfig('snappy')),
        withSpring(1, springConfig('snappy')),
      );
    }
    wasActive.current = isActive;
  }, [isActive, pop]);
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      className="min-w-0 flex-1 items-center justify-center gap-px"
    >
      <Animated.View style={popStyle}>
        <IconGlyph size={24} strokeWidth={isActive ? 2.2 : 1.8} color={color} />
      </Animated.View>
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
