import { useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { StoryTone } from './model';
import { glowStops, TONE_ORDER } from './tones';

interface GlowLayerProps {
  tone: StoryTone;
  isActive: boolean;
  width: number;
  height: number;
}

function GlowLayer({ tone, isActive, width, height }: GlowLayerProps) {
  const isReduced = useReduceMotion();
  const opacity = useSharedValue(isActive ? 1 : 0);
  React.useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0, {
      duration: isReduced ? 300 : 600,
    });
  }, [opacity, isActive, isReduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const { first, second } = glowStops(tone);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient
            id={`g1-${tone}`}
            cx={width * 0.06}
            cy={height * 0.06 * 0.9}
            r={340}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0"
              stopColor={`rgb(${first.rgb})`}
              stopOpacity={first.alpha}
            />
            <Stop offset="1" stopColor={`rgb(${first.rgb})`} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id={`g2-${tone}`}
            cx={width * 0.92}
            cy={height * 0.88}
            r={300}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0"
              stopColor={`rgb(${second.rgb})`}
              stopOpacity={second.alpha}
            />
            <Stop offset="1" stopColor={`rgb(${second.rgb})`} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={width} height={height} fill={`url(#g1-${tone})`} />
        <Rect width={width} height={height} fill={`url(#g2-${tone})`} />
      </Svg>
    </Animated.View>
  );
}

/** One radial glow per tone; the active tone fades in while the others fade out. */
export function ToneGlow({
  tone,
  width,
  height,
}: {
  tone: StoryTone;
  width: number;
  height: number;
}) {
  return (
    <>
      {TONE_ORDER.map((t) => (
        <GlowLayer
          key={t}
          tone={t}
          isActive={t === tone}
          width={width}
          height={height}
        />
      ))}
    </>
  );
}
