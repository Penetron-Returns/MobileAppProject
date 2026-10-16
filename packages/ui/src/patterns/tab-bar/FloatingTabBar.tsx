import type { Tabs } from 'expo-router';
import {
  CalendarDays,
  ChartNoAxesColumn,
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

import { haptics } from '../../lib/haptics';
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
  DEFAULT_TABS,
  TAB_BAR_HEIGHT,
  tabBarBottomOffset,
  type TabRouteName,
} from './layout';
import { useDsText } from '../../lib/strings';
import { usePressBounce } from './usePressBounce';

const TAB_ICONS: Record<TabRouteName, LucideIcon> = {
  index: Sun,
  calendar: CalendarDays,
  reports: ChartNoAxesColumn,
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
 * The floating tab bar of the iPhone design: equal tabs in one raised
 * capsule and a dome above the right-hand end. Every tab, Reports included, is drawn the same. The app picks the tabs and
 * their order through `tabs`; Free passes `onAdd`, which puts the "+" (New
 * booking, opened as a modal) between the two halves, and the Inbox dome.
 * Paid plans pass Reports as an ordinary fifth tab and the Companion dome. Hidden on screens
 * that opt out through `tabBarStyle: { display: 'none' }`. The selected pill
 * slides between tabs, the tapped icon pops and a light haptic confirms the
 * change.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  tabs = DEFAULT_TABS,
  onAdd,
  dome,
}: TabBarProps & {
  /** The tabs to show, left to right. Routes missing from the navigator are skipped. */
  tabs?: readonly TabRouteName[];
  /** When given, a centre "+" opens New booking (a route, not a tab) through this. */
  onAdd?: () => void;
  /** The Inbox or Companion dome (or nothing) shown above the right-hand end of the bar. */
  dome?: React.ReactNode;
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
      if (name !== activeName) haptics.selection();
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

  // The "+" (when given) sits between the two halves.
  const split = Math.ceil(tabs.length / 2);

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
        {dome}
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
        {tabs.slice(0, split).map(renderTab)}
        {onAdd ? (
          <Pressable
            onPress={() => {
              haptics.light();
              onAdd();
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
        ) : null}
        {tabs.slice(split).map(renderTab)}
      </View>
    </View>
  );
}

/** Icon and label colour of a tab: tint when selected, the inactive grey otherwise. */
function tabColor(depth: DepthTokens, isActive: boolean): string {
  return isActive ? depth.colors.tint : depth.colors.inactive;
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
  const color = tabColor(depth, isActive);
  // Every tap dips the icon (1, 0.86, 1) and springs it back, even on the
  // tab that is already selected. Reduce motion makes both legs instant.
  const pop = useSharedValue(1);
  const bounce = () => {
    pop.value = withSequence(
      withTiming(SCALE.tabDip, timingConfig(DURATION.press)),
      withSpring(1, springConfig('snappy')),
    );
  };
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  return (
    <Pressable
      onPress={() => {
        bounce();
        onPress();
      }}
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
