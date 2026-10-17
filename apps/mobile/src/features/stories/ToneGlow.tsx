import { useReduceMotion } from '@booking/ui';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { StoryTone } from './model';
import { toneWash } from './tones';

/**
 * A full-page tone wash (native gradient) under one blurred glow per tone, pre-rendered by scripts/clovie/render-sprites.mjs
 * (the two radial gradients of the board, on a 402 x 874 reference at half
 * scale). Stretched to the screen, so a card change is only an opacity fade.
 */
const GLOWS: Record<StoryTone, number> = {
  positive: require('@/assets/images/clovie/glow-positive.png'),
  neutral: require('@/assets/images/clovie/glow-neutral.png'),
  attention: require('@/assets/images/clovie/glow-attention.png'),
  concern: require('@/assets/images/clovie/glow-concern.png'),
};

const FADE_MS = 600;
const REDUCED_FADE_MS = 300;

interface GlowLayerProps {
  tone: StoryTone;
  isActive: boolean;
  /** The glow that is there when the viewer opens starts fully visible; later ones fade in. */
  isInstant: boolean;
  fadeMs: number;
}

function GlowLayer({ tone, isActive, isInstant, fadeMs }: GlowLayerProps) {
  const opacity = useSharedValue(isInstant ? 1 : 0);
  React.useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0, { duration: fadeMs });
  }, [opacity, isActive, fadeMs]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      <LinearGradient colors={toneWash(tone)} style={StyleSheet.absoluteFill} />
      <Image
        source={GLOWS[tone]}
        resizeMode="stretch"
        fadeDuration={0}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * The active tone's glow fades in while the previous one fades out and is then
 * unmounted, so at most two bitmaps exist and none outlives its fade.
 */
export function ToneGlow({ tone }: { tone: StoryTone }) {
  const isReduced = useReduceMotion();
  const fadeMs = isReduced ? REDUCED_FADE_MS : FADE_MS;
  const [glow, setGlow] = React.useState<{
    current: StoryTone;
    leaving: StoryTone | null;
  }>({ current: tone, leaving: null });
  const hasMounted = React.useRef(false);
  const isInstant = !hasMounted.current;
  React.useEffect(() => {
    hasMounted.current = true;
  }, []);
  // Derived during render, so the old glow stays mounted through the same commit that brings in the new one.
  if (glow.current !== tone) setGlow({ current: tone, leaving: glow.current });
  React.useEffect(() => {
    if (glow.leaving === null) return;
    const timer = setTimeout(
      () => setGlow((g) => ({ ...g, leaving: null })),
      fadeMs + 50,
    );
    return () => clearTimeout(timer);
  }, [glow.leaving, fadeMs]);
  const { leaving } = glow;
  return (
    <>
      {leaving && leaving !== tone ? (
        <GlowLayer
          key={leaving}
          tone={leaving}
          isActive={false}
          isInstant={false}
          fadeMs={fadeMs}
        />
      ) : null}
      <GlowLayer
        key={tone}
        tone={tone}
        isActive
        isInstant={isInstant}
        fadeMs={fadeMs}
      />
    </>
  );
}
