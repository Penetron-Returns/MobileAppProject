import { useAppColorScheme } from '@booking/ui';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedProps,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { LABEL_MAX_FONT_SCALE, storyLabelHeight } from './ringLayout';
import { COLORS, GAP_NEW, PRESS_TIMING, RING, styles } from './StoryRing';
import { KIND_GLYPHS, TONES } from './tones';

export interface ProgressStoryRingProps {
  label: string;
  /** Read by screen readers instead of the label, e.g. "Get set up, 4 of 7 done". */
  accessibilityLabel: string;
  icon: LucideIcon;
  done: number;
  total: number;
  onPress: () => void;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** One glide to a new value, never a loop: nothing runs while the ring rests. */
const GLIDE = { duration: 600, reduceMotion: ReduceMotion.System } as const;

const STROKE = (RING - GAP_NEW) / 2 + 1;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A story-shaped bubble for a task list: the same ring, tile and label as
 * `StoryRing`, with the ring drawn as an arc filled to `done / total`. It is
 * never "viewed": it stays until the list is finished. Flat, no shadow.
 */
export const ProgressStoryRing = React.memo(function ProgressStoryRing({
  label,
  accessibilityLabel,
  icon: Icon,
  done,
  total,
  onPress,
}: ProgressStoryRingProps) {
  const { fontScale } = useWindowDimensions();
  const { isDark } = useAppColorScheme();
  const c = COLORS[isDark ? 'dark' : 'light'];
  const glyph = KIND_GLYPHS.brief[isDark ? 'dark' : 'light'];
  const press = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));
  const fraction = total > 0 ? Math.min(done / total, 1) : 0;
  const arc = TONES.neutral.ring[1];
  const progress = useSharedValue(fraction);
  React.useEffect(() => {
    progress.value = withTiming(fraction, GLIDE);
  }, [fraction, progress]);
  const arcProps = useAnimatedProps(() => ({
    strokeDasharray: `${CIRCUMFERENCE * progress.value} ${CIRCUMFERENCE}`,
    // A round cap would draw a dot at zero.
    strokeOpacity: progress.value > 0 ? 1 : 0,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(0.94, PRESS_TIMING);
      }}
      onPressOut={() => {
        press.value = withTiming(1, PRESS_TIMING);
      }}
      style={styles.button}
    >
      <Animated.View style={scaleStyle}>
        <View style={styles.ring}>
          <Svg
            width={RING}
            height={RING}
            style={[
              StyleSheet.absoluteFill,
              { transform: [{ rotate: '-90deg' }] },
            ]}
          >
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={c.grey}
              strokeWidth={STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={arc}
              strokeWidth={STROKE}
              strokeLinecap="round"
              animatedProps={arcProps}
              fill="none"
            />
          </Svg>
          <View
            style={[
              styles.gap,
              { backgroundColor: c.gap, width: GAP_NEW, height: GAP_NEW },
            ]}
          >
            <View style={tile.base}>
              <LinearGradient
                colors={glyph.tile}
                style={StyleSheet.absoluteFill}
              />
              <Icon size={32} strokeWidth={1.8} color={glyph.ink} />
            </View>
          </View>
        </View>
      </Animated.View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
        style={[
          styles.label,
          {
            height: storyLabelHeight(fontScale),
            color: c.label,
            fontWeight: '600',
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const tile = StyleSheet.create({
  base: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
