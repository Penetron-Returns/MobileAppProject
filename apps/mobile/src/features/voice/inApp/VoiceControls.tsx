import { Pressable, Text, useDepth } from '@booking/ui';
import { Mic, X } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { holdAt, startLoop } from './voiceMotion';
import { radialFade, voiceTokens } from './voiceTokens';

/** The board's round controls: 72 pt stop and cancel, 56 pt mic. */
export const BIG_BUTTON = 72;
export const MIC_BUTTON = 56;

/** An expanding, fading ring behind a round button (`vi-ring`, 1.8 s, the second one half a cycle later). */
function Ring({
  size,
  delayMs,
  isLive,
}: {
  size: number;
  delayMs: number;
  isLive: boolean;
}) {
  const { ringColor } = voiceTokens(useDepth());
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (!isLive) {
      holdAt(t, 0);
      return;
    }
    // A ring grows from 1 to 1.7 and fades 0.5 to 0, then restarts: a forward loop, offset by `delayMs`.
    const id = setTimeout(
      () => startLoop(t, { from: 0, to: 1, durationMs: 1800, reverse: false }),
      delayMs,
    );
    return () => {
      clearTimeout(id);
      holdAt(t, 0);
    };
  }, [isLive, delayMs, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - t.value),
    transform: [{ scale: 1 + 0.7 * t.value }],
  }));
  return (
    <Animated.View
      testID="voice-ring"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: ringColor,
        },
        style,
      ]}
    />
  );
}

/** Rings only while live: Reduce Motion hides them entirely, as in the board. */
export function Rings({ size, isLive }: { size: number; isLive: boolean }) {
  if (!isLive) return null;
  return (
    <>
      <Ring size={size} delayMs={0} isLive />
      <Ring size={size} delayMs={900} isLive />
    </>
  );
}

/** The primary round stop button: white rounded square on the tint gradient. 72 pt. */
export function StopButton({
  label,
  onPress,
  isLive,
}: {
  label: string;
  onPress: () => void;
  isLive: boolean;
}) {
  const depth = useDepth();
  return (
    <View style={{ width: BIG_BUTTON, height: BIG_BUTTON }}>
      <Rings size={BIG_BUTTON} isLive={isLive} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        feedback="nudge"
        pressedScale={1}
        onPress={onPress}
        style={[
          {
            width: BIG_BUTTON,
            height: BIG_BUTTON,
            borderRadius: BIG_BUTTON / 2,
            alignItems: 'center',
            justifyContent: 'center',
          },
          depth.primary,
        ]}
      >
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 3.5,
            backgroundColor: '#FFFFFF',
          }}
        />
      </Pressable>
    </View>
  );
}

/** The secondary round control (raised, tint glyph): cancel at 72 pt, mic at 56 pt. */
function RoundButton({
  size,
  label,
  onPress,
  children,
}: {
  size: number;
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const depth = useDepth();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      feedback="inset"
      pressedScale={1}
      onPress={onPress}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        depth.button,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function CancelButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useDepth();
  return (
    <RoundButton size={BIG_BUTTON} label={label} onPress={onPress}>
      <X size={26} strokeWidth={2.4} color={colors.tint} />
    </RoundButton>
  );
}

/** The 56 pt mic that continues the conversation; its ring runs only while the microphone is open and live. */
export function MicButton({
  label,
  onPress,
  isRinging,
}: {
  label: string;
  onPress: () => void;
  isRinging: boolean;
}) {
  const { colors } = useDepth();
  return (
    <View style={{ width: MIC_BUTTON, height: MIC_BUTTON }}>
      <Rings size={MIC_BUTTON} isLive={isRinging} />
      <RoundButton size={MIC_BUTTON} label={label} onPress={onPress}>
        <Mic size={24} strokeWidth={2} color={colors.tint} />
      </RoundButton>
    </View>
  );
}

/** The soft Clovie halo behind the character: swells and fades slowly while live. */
export function Halo({
  size,
  inset,
  isLive,
}: {
  size: number;
  inset: number;
  isLive: boolean;
}) {
  const { haloColor } = voiceTokens(useDepth());
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (!isLive) {
      holdAt(t, 0.5);
      return;
    }
    startLoop(t, { from: 0, to: 1, durationMs: 4000 });
    return () => holdAt(t, 0.5);
  }, [isLive, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * t.value,
    transform: [{ scale: 0.9 + 0.22 * t.value }],
  }));
  return (
    <Animated.View
      testID="voice-halo"
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: -inset,
          top: -inset,
          width: size,
          height: size,
          borderRadius: size / 2,
          experimental_backgroundImage: radialFade(haloColor),
        },
        style,
      ]}
    />
  );
}

/** The caption under a round control ("Tap to stop", "Cancel"). */
export function Caption({ children }: { children: string }) {
  const { colors } = useDepth();
  return (
    <Text
      style={{
        marginTop: 6,
        fontSize: 15,
        lineHeight: 20,
        color: colors.secondary,
      }}
    >
      {children}
    </Text>
  );
}
