import { useAppColorScheme } from '@booking/ui';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { KindTile } from './KindTile';
import {
  LABEL_MARGIN_TOP,
  LABEL_MAX_FONT_SCALE,
  RING_SIZE,
  storyLabelHeight,
} from './ringLayout';
import type { OriginFrame, Story } from './model';
import { TONES } from './tones';

export interface StoryRingProps {
  story: Pick<Story, 'id' | 'kind' | 'title' | 'tone' | 'viewed'>;
  /** Called with the bubble's measured window frame, for the viewer's shared-element open. */
  onPress: (storyId: string, frame: OriginFrame) => void;
}

export const RING = RING_SIZE;
export const GAP_NEW = 70;
const GAP_VIEWED = 74;

export const COLORS = {
  light: {
    gap: '#F6F6F9',
    grey: 'rgba(60,60,67,0.3)',
    label: '#000000',
    dim: 'rgba(60,60,67,0.58)',
  },
  dark: {
    gap: '#101116',
    grey: 'rgba(235,235,245,0.3)',
    label: '#FFFFFF',
    dim: 'rgba(235,235,245,0.56)',
  },
} as const;

/** One press-scale leg: quick and instant under Reduce Motion. */
export const PRESS_TIMING = {
  duration: 120,
  reduceMotion: ReduceMotion.System,
} as const;

/**
 * A story bubble: a tone gradient ring while new, a 1 pt grey ring once
 * viewed, the title under it, and a press scale. Nothing animates at rest;
 * the ring fade and gap resize play once when `viewed` flips.
 */
export const StoryRing = React.memo(function StoryRing({
  story,
  onPress,
}: StoryRingProps) {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  const c = COLORS[isDark ? 'dark' : 'light'];
  const { fontScale } = useWindowDimensions();
  const ringRef = React.useRef<View>(null);
  // Measured as the finger lands, so the frame is ready before the press ends.
  const frameRef = React.useRef<OriginFrame | null>(null);
  const press = useSharedValue(1);
  const isNew = !story.viewed;
  const fresh = useSharedValue(isNew ? 1 : 0);

  React.useEffect(() => {
    fresh.value = withTiming(isNew ? 1 : 0, {
      duration: 500,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
  }, [fresh, isNew]);

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: fresh.value }));
  const gapStyle = useAnimatedStyle(() => {
    const size = GAP_VIEWED + (GAP_NEW - GAP_VIEWED) * fresh.value;
    return { width: size, height: size };
  });

  const measure = () => {
    ringRef.current?.measureInWindow((x, y, width, height) => {
      frameRef.current = { x, y, width, height };
    });
  };
  const handlePress = () => {
    const known = frameRef.current;
    if (known) {
      onPress(story.id, known);
      return;
    }
    ringRef.current?.measureInWindow((x, y, width, height) =>
      onPress(story.id, { x, y, width, height }),
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(isNew ? 'stories.ringNew' : 'stories.ringViewed', {
        title: story.title,
      })}
      onPress={handlePress}
      onPressIn={() => {
        measure();
        press.value = withTiming(0.94, PRESS_TIMING);
      }}
      onPressOut={() => {
        press.value = withTiming(1, PRESS_TIMING);
      }}
      style={styles.button}
    >
      <Animated.View style={scaleStyle}>
        <View
          ref={ringRef}
          collapsable={false}
          style={[styles.ring, { backgroundColor: c.grey }]}
        >
          <Animated.View style={[styles.gradient, ringStyle]}>
            <LinearGradient
              colors={TONES[story.tone].ring}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[styles.gap, { backgroundColor: c.gap }, gapStyle]}
          >
            <KindTile kind={story.kind} size={64} isDark={isDark} />
          </Animated.View>
        </View>
      </Animated.View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={LABEL_MAX_FONT_SCALE}
        style={[
          styles.label,
          {
            height: storyLabelHeight(fontScale),
            color: isNew ? c.label : c.dim,
            fontWeight: isNew ? '600' : '500',
          },
        ]}
      >
        {story.title}
      </Text>
    </Pressable>
  );
});

/** Shared with the other bubble kinds, so every ring and label lines up. */
export const styles = StyleSheet.create({
  button: { width: 80, alignItems: 'center' },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    ...StyleSheet.absoluteFill,
    borderRadius: RING / 2,
    overflow: 'hidden',
  },
  gap: {
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: LABEL_MARGIN_TOP,
    width: 80,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
});
