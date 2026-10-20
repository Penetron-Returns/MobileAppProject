import * as React from 'react';
import {
  KeyboardAvoidingView,
  RefreshControl,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KEYBOARD_AVOIDING_BEHAVIOR } from '../lib/keyboard';
import { Ground } from '../primitives/Ground';
import { Text } from '../primitives/Text';
import { useAppColorScheme } from '../theme/useAppColorScheme';
import { useDepth } from '../theme/useDepth';
import { collapseThreshold } from '../lib/titleCollapse';
import { BackPill } from './BackPill';
import {
  AnimatedScrollView,
  CollapsingBar,
  NAV_ROW_HEIGHT,
  useTitleCollapse,
} from './CollapsingTitle';
import { INBOX_DOME_CLEARANCE, tabBarClearance } from './tab-bar/layout';

/** Height reserved for the back pill row in the content (and its pinned twin). */
const BACK_ROW = 44;
/** Large title line height, for the threshold before the title is measured. */
const LARGE_TITLE_LINE = 41;

/** Fade height below the status bar: clear of the 34pt title that rests under it. */
const NAV_FADE_EXTRA = 8;

export interface PageProps {
  /** Large title under the (optional) back pill. */
  title: string;
  /** Small line above the title (e.g. a date). */
  caption?: string | null;
  /** Shows the back pill with this label (pushed screens). */
  backLabel?: string;
  /** Where back goes when there is no history (deep link, web refresh). */
  backFallback?: string;
  /** Top-level tab screen: leaves room for the floating bar (and the Inbox dome). */
  isTab?: boolean;
  /** Control at the right of the title row (e.g. a button). */
  titleRight?: React.ReactNode;
  onRefresh?: () => void | Promise<unknown>;
  /** Pinned under the scroll area (composer, primary action). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The shared shell of the depth-styled screens: ground gradient, safe areas,
 * a back pill on pushed screens, the 34pt large title and pull to refresh.
 */
export function Page({
  title,
  caption,
  backLabel,
  backFallback,
  isTab,
  titleRight,
  onRefresh,
  footer,
  children,
}: PageProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppColorScheme();
  const depth = useDepth();
  const [refreshing, setRefreshing] = React.useState(false);
  const paddingTop = insets.top + 8;
  const barHeight = insets.top + NAV_ROW_HEIGHT;
  const [titleBottom, setTitleBottom] = React.useState(
    paddingTop + (backLabel ? BACK_ROW : 0) + 4 + LARGE_TITLE_LINE,
  );
  const { scrollHandler, barStyle, titleStyle } = useTitleCollapse(
    collapseThreshold(titleBottom, barHeight),
  );
  const onTitleLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setTitleBottom(paddingTop + y + height);
  };

  const handleRefresh = React.useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const bottom = isTab
    ? tabBarClearance(insets.bottom) + INBOX_DOME_CLEARANCE
    : insets.bottom + 32;

  return (
    <Ground className="flex-1">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={KEYBOARD_AVOIDING_BEHAVIOR}
      >
        <AnimatedScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingTop,
            paddingBottom: footer ? 16 : bottom,
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void handleRefresh()}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
        >
          <View className="w-full max-w-2xl self-center">
            {backLabel ? <View style={{ height: BACK_ROW }} /> : null}
            <View
              onLayout={onTitleLayout}
              className="flex-row items-end justify-between pl-5 pr-4 pt-1"
            >
              <View className="min-w-0 flex-1">
                {caption ? (
                  <Text className="text-subtitle font-semibold text-muted-foreground">
                    {caption}
                  </Text>
                ) : null}
                <Animated.View style={titleStyle}>
                  <Text
                    role="heading"
                    aria-level="1"
                    className="text-large-title font-bold"
                  >
                    {title}
                  </Text>
                </Animated.View>
              </View>
              {titleRight}
            </View>
            {children}
          </View>
        </AnimatedScrollView>
        {footer}
      </KeyboardAvoidingView>
      {/* The board's glass nav fade: scrolled content dissolves under the status bar
          instead of sliding under it. Stops short of the resting large title. */}
      <View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        testID="page-nav-fade"
        style={[
          depth.navFade,
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + NAV_FADE_EXTRA,
          },
        ]}
      />
      <CollapsingBar title={title} height={barHeight} style={barStyle} />
      {backLabel ? (
        <View style={{ position: 'absolute', top: insets.top + 2, left: 0 }}>
          <BackPill label={backLabel} fallback={backFallback} />
        </View>
      ) : null}
    </Ground>
  );
}
