import { TIMING, useDepth } from '@booking/ui';
import * as React from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { holdAt, phaseFromDelay, startLoop } from './voiceMotion';
import {
  BLOBS,
  BOARD_WIDTH,
  radialFade,
  voiceTokens,
  type VoiceTokens,
} from './voiceTokens';

export type GlowMode = 'listening' | 'thinking' | 'answer';

/** The board's blob scale ranges (`vi-a`, `vi-breath`) and the gather to a line while thinking (`vi-gather`). */
const SCALE = {
  listening: { from: 0.5, to: 0.95, rest: 0.8 },
  answer: { from: 0.36, to: 0.54, rest: 0.5 },
  thinking: { from: 0.05, to: 0.05, rest: 0.05 },
} as const;
const GATHER_MS = 1200;
const BREATH_SECONDS = 4.2;

interface BlobProps {
  spec: (typeof BLOBS)[number];
  tokens: VoiceTokens;
  mode: GlowMode;
  isLive: boolean;
  scale: number;
}

/** One soft blob rising from the drawer's bottom edge: it breathes up and down and drifts sideways while live. */
function Blob({ spec, tokens, mode, isLive, scale }: BlobProps) {
  const lift = useSharedValue<number>(SCALE[mode].rest);
  const drift = useSharedValue(0);
  const fade = useSharedValue(1);

  React.useEffect(() => {
    const range = SCALE[mode];
    if (mode === 'thinking') {
      // Gathers into the beam once, then rests: no loop.
      holdAt(drift, 0);
      cancelAnimation(lift);
      lift.value = isLive
        ? withTiming(range.rest, { duration: GATHER_MS })
        : range.rest;
      fade.value = isLive ? withTiming(0, { duration: GATHER_MS }) : 0;
      return;
    }
    fade.value = 1;
    if (!isLive) {
      holdAt(lift, range.rest);
      holdAt(drift, 0);
      return;
    }
    const period = mode === 'listening' ? spec.d : BREATH_SECONDS;
    startLoop(lift, {
      from: range.from,
      to: range.to,
      durationMs: period * 1000,
      phase: phaseFromDelay(spec.dl, period),
    });
    startLoop(drift, {
      from: -spec.dx,
      to: spec.dx,
      durationMs: spec.dd * 1000,
      phase: phaseFromDelay(spec.dl, spec.dd),
    });
    return () => {
      holdAt(lift, range.rest);
      holdAt(drift, 0);
    };
  }, [mode, isLive, spec, lift, drift, fade]);

  const style = useAnimatedStyle(() => ({
    opacity: tokens.blobOpacity * fade.value,
    transform: [{ translateX: drift.value }, { scaleY: lift.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: -150,
          height: 330,
          left: spec.left * scale,
          width: spec.width * scale,
          borderRadius: 9999,
          transformOrigin: '50% 100%',
          mixBlendMode: tokens.blend,
          experimental_backgroundImage: radialFade(
            tokens.blobColors[spec.color],
          ),
        },
        style,
      ]}
    />
  );
}

/** The line that travels along the bottom edge while thinking (`vi-beam`). */
function Beam({ isLive, tokens }: { isLive: boolean; tokens: VoiceTokens }) {
  const x = useSharedValue(0);
  const opacity = useSharedValue(isLive ? 0 : 1);
  React.useEffect(() => {
    if (!isLive) {
      holdAt(x, 0);
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(1, { ...TIMING.page, duration: 900 });
    startLoop(x, { from: -120, to: 120, durationMs: 3500 });
    return () => holdAt(x, 0);
  }, [isLive, x, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));
  return (
    <Animated.View
      testID="voice-beam"
      style={[
        {
          position: 'absolute',
          left: 101,
          bottom: 0,
          width: 200,
          height: 6,
          borderRadius: 3,
          experimental_backgroundImage: tokens.beamImage,
        },
        style,
      ]}
    />
  );
}

/**
 * The glow that rises from the drawer's bottom edge (board: five blurred blobs in the Clovie blues and teal, the
 * same family as the out-of-app overlay). Decorative. With `isLive` false (Reduce Motion, hidden, backgrounded) the
 * blobs hold still at the board's resting scale and nothing loops.
 */
export function VoiceGlow({
  mode,
  isLive,
}: {
  mode: GlowMode;
  isLive: boolean;
}) {
  const tokens = voiceTokens(useDepth());
  const { width } = useWindowDimensions();
  const scale = width / BOARD_WIDTH;
  return (
    <View
      testID="voice-glow"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 230,
        overflow: 'hidden',
      }}
    >
      {BLOBS.map((spec) => (
        <Blob
          key={spec.left}
          spec={spec}
          tokens={tokens}
          mode={mode}
          isLive={isLive}
          scale={scale}
        />
      ))}
      {mode === 'thinking' ? <Beam isLive={isLive} tokens={tokens} /> : null}
    </View>
  );
}
