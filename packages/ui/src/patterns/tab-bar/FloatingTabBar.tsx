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
  useWindowDimensions,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Animated, {
  ReduceMotion,
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
import { DURATION, timingConfig } from '../../tokens/motion';

import {
  INBOX_DOME_GAP,
  INBOX_DOME_SIZE,
  DEFAULT_TABS,
  TAB_BAR_HEIGHT,
  tabBarHeight,
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

/** What a custom tab icon is drawn with. */
export interface TabIconProps {
  size: number;
  strokeWidth: number;
  color: string;
  isActive: boolean;
}

// expo-router bundles its own react-navigation, so take the props type from it.
type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

/** Position of a tab inside the bar, measured on layout. */
interface TabFrame {
  x: number;
  width: number;
}

/** Inset of the tabs inside the capsule (p-1): the pill sits within it. */
const BAR_PAD = 4;

/** Quick settle (~250ms) for the pill and the icon dip; instant under Reduce Motion. */
const PILL_SPRING = {
  duration: 280,
  dampingRatio: 0.85,
  reduceMotion: ReduceMotion.System,
} as const;

/** A quiet, short dip: the icon acknowledges the tap without a visible jump. */
const ICON_DIP = 0.94;

/** Above this font scale the labels would overflow the capsule: show icons only. */
export const LABEL_MAX_FONT_SCALE = 1.2;

/**
 * The tab bar of the iPhone design: equal tabs in one flat, edge-to-edge
 * bar (hairline top border, bottom inset inside it) and a floating dome above the right-hand end. Every tab, Reports included, is drawn the same. The app picks the tabs and
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
  tabLabels,
  tabIcons,
  onAdd,
  dome,
}: TabBarProps & {
  /** The tabs to show, left to right. Routes missing from the navigator are skipped. */
  tabs?: readonly TabRouteName[];
  /** Replaces a tab's label (the app renames the first tab per plan). */
  tabLabels?: Partial<Record<TabRouteName, string>>;
  /** Replaces a tab's icon, e.g. the Clovie glyph. */
  tabIcons?: Partial<
    Record<TabRouteName, (props: TabIconProps) => React.ReactNode>
  >;
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
  const pillScale = useSharedValue(1);
  const pillOn = useSharedValue(0);
  const placed = React.useRef(false);
  const framesRef = React.useRef(frames);
  framesRef.current = frames;
  // The pill is drawn at one base width and stretched with scaleX, so the
  // slide runs on transforms only (no layout pass per frame).
  const baseW = React.useMemo(
    () => Math.max(1, ...Object.values(frames).map((f) => f.width)),
    [frames],
  );
  const baseRef = React.useRef(baseW);
  baseRef.current = baseW;
  const moveTo = React.useCallback(
    (frame: TabFrame, animate: boolean) => {
      const base = baseRef.current;
      const x = frame.x + frame.width / 2 - base / 2;
      const scale = frame.width / base;
      if (animate) {
        pillX.value = withSpring(x, PILL_SPRING);
        pillScale.value = withSpring(scale, PILL_SPRING);
      } else {
        pillX.value = x;
        pillScale.value = scale;
      }
    },
    [pillScale, pillX],
  );
  React.useEffect(() => {
    if (!activeFrame) {
      pillOn.value = withTiming(0, timingConfig(DURATION.quick));
      return;
    }
    // First placement lands without sliding in from the left edge.
    moveTo(activeFrame, placed.current);
    placed.current = true;
    pillOn.value = withTiming(1, timingConfig(DURATION.quick));
  }, [activeFrame, baseW, moveTo, pillOn]);
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOn.value,
    transform: [{ translateX: pillX.value }, { scaleX: pillScale.value }],
  }));
  const { fontScale } = useWindowDimensions();
  const iconOnly = fontScale > LABEL_MAX_FONT_SCALE;

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
      if (name !== activeName) {
        haptics.selection();
        // Move the pill now; the screen mounts after.
        const target = framesRef.current[name as TabRouteName];
        if (target) moveTo(target, true);
      }
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
        renderIcon={tabIcons?.[name]}
        label={
          tabLabels?.[name] ?? t(`tabs.${name === 'index' ? 'today' : name}`)
        }
        isActive={activeName === name}
        depth={depth}
        iconOnly={iconOnly}
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
        bottom: 0,
        height: tabBarHeight(insets.bottom) + INBOX_DOME_GAP + INBOX_DOME_SIZE,
      }}
    >
      <View
        pointerEvents="box-none"
        className="absolute right-5 top-0 items-end"
      >
        {dome}
      </View>
      <View
        style={[
          depth.bar,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: tabBarHeight(insets.bottom),
            paddingBottom: Math.max(insets.bottom, 0),
            boxShadow: 'none',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: depth.colors.hairline,
          },
        ]}
      >
        <View
          accessibilityRole="tablist"
          style={{ height: TAB_BAR_HEIGHT }}
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
                width: baseW,
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
                    depth.navPrimary,
                    pressed && depth.navPrimaryPressed,
                    addBounce.style,
                  ]}
                  className="h-[52px] w-[52px] items-center justify-center rounded-full"
                >
                  <Plus
                    size={26}
                    strokeWidth={2.4}
                    color={depth.colors.onFill}
                  />
                </Animated.View>
              )}
            </Pressable>
          ) : null}
          {tabs.slice(split).map(renderTab)}
        </View>
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
  renderIcon,
  label,
  isActive,
  depth,
  iconOnly,
  onPress,
  onLayout,
}: {
  icon: LucideIcon;
  renderIcon?: (props: TabIconProps) => React.ReactNode;
  label: string;
  isActive: boolean;
  depth: DepthTokens;
  iconOnly: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const color = tabColor(depth, isActive);
  // Every tap dips the icon slightly (1, 0.94, 1) and springs it back, even on
  // the tab that is already selected. Reduce motion makes both legs instant.
  const pop = useSharedValue(1);
  const bounce = () => {
    pop.value = withSequence(
      withTiming(ICON_DIP, timingConfig(DURATION.press / 2)),
      withSpring(1, PILL_SPRING),
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
        {renderIcon ? (
          renderIcon({
            size: 24,
            strokeWidth: isActive ? 2.2 : 1.8,
            color,
            isActive,
          })
        ) : (
          <IconGlyph
            size={24}
            strokeWidth={isActive ? 2.2 : 1.8}
            color={color}
          />
        )}
      </Animated.View>
      {iconOnly ? null : (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
          style={{ color }}
          className={
            isActive
              ? 'text-[11px] font-semibold leading-[13px]'
              : 'text-[11px] font-medium leading-[13px]'
          }
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
