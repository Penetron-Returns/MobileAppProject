import { BlurView } from 'expo-blur';
import * as React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { titleCollapse } from '../lib/titleCollapse';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { withAlpha, type DepthTokens } from '../tokens/depth';
import { useReduceMotion } from '../theme/useReduceMotion';

/** Height of the nav row under the status bar. */
export const NAV_ROW_HEIGHT = 44;

/** A `ScrollView` whose `onScroll` can be a Reanimated scroll handler. */
export const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

/**
 * Drives the large-title collapse from the scroll offset on the UI thread:
 * `scrollHandler` goes on an `AnimatedScrollView`, `barStyle` on the bar,
 * `titleStyle` on the large title (it stretches on overscroll).
 */
export function useTitleCollapse(threshold: number) {
  const reduceMotion = useReduceMotion();
  const offset = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: titleCollapse(offset.value, threshold, reduceMotion).barOpacity,
  }));
  const titleStyle = useAnimatedStyle(() => ({
    transformOrigin: 'left bottom',
    transform: [
      {
        scale: titleCollapse(offset.value, threshold, reduceMotion).titleScale,
      },
    ],
  }));
  return { scrollHandler, barStyle, titleStyle };
}

/**
 * Android material: the ground colour, nearly opaque, with a hairline. The
 * `navFade` gradient dissolves content at rest, but fades to clear at its
 * bottom edge, which would let scrolled rows show through the inline title.
 */
function androidMaterial(depth: DepthTokens) {
  return {
    backgroundColor: withAlpha(depth.ground.backgroundColor as string, 0.96),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: depth.colors.hairline,
  } as const;
}

/**
 * The material bar of a large-title screen: transparent at rest, it fades in
 * with a centred 17pt semibold title once the large title passes under it. A
 * real blur on iOS; the `navFade` token on Android, where a blur behind
 * scrolling content is unreliable.
 */
export function CollapsingBar({
  title,
  height,
  style,
}: {
  title: string;
  /** Status bar inset plus the nav row. */
  height: number;
  style: React.ComponentProps<typeof Animated.View>['style'];
}) {
  const depth = useDepth();
  const isIos = Platform.OS === 'ios';
  return (
    <Animated.View
      pointerEvents="none"
      testID="collapsing-bar"
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height,
          overflow: 'hidden',
        },
        isIos ? null : androidMaterial(depth),
        style,
      ]}
    >
      {isIos ? (
        <>
          <BlurView
            intensity={50}
            tint={
              depth.scheme === 'dark'
                ? 'systemChromeMaterialDark'
                : 'systemChromeMaterialLight'
            }
            style={StyleSheet.absoluteFill}
          />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: depth.colors.hairline,
            }}
          />
        </>
      ) : null}
      <View
        style={{
          position: 'absolute',
          left: 124,
          right: 124,
          bottom: 0,
          height: NAV_ROW_HEIGHT,
        }}
        className="items-center justify-center"
      >
        <Text numberOfLines={1} className="max-w-full text-title font-semibold">
          {title}
        </Text>
      </View>
    </Animated.View>
  );
}
