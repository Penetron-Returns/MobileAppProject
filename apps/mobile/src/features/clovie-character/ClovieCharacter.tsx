import { useAppColorScheme, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BLINK, EYES, startBlinkLoop, type BlinkClock } from './blink';
import { ClovieProps } from './ClovieProps';
import { sampleFrames } from './keyframes';
import {
  compiledPose,
  composePose,
  poseFor,
  propsFor,
  type ClovieEmotion,
} from './poses';
import { useLoop } from './useLoop';

/** The character is drawn on an 84 pt box and scaled to `size`. */
const DESIGN = 84;
const BLINK_EASE = Easing.inOut(Easing.ease);

export type BlinkMode = 'auto' | 'event' | 'off';

export interface ClovieCharacterHandle {
  /** One blink now. A no-op when blinking is off or Reduce Motion is on. */
  blinkOnce: () => void;
}

export interface ClovieCharacterProps {
  emotion: ClovieEmotion;
  /** Layout size in pt. Props spill outside it, so do not clip the parent. */
  size?: number;
  /** Loops (pose, props, auto blinks) run only while true. At rest nothing animates. */
  isActive?: boolean;
  /** `auto`: randomised timer while active. `event`: only `blinkOnce()`. `off`: never. */
  blink?: BlinkMode;
  /** Curious only: shows the magnifier. */
  isSearching?: boolean;
  /** Delighted only: stars fall into his hands. */
  isCatching?: boolean;
  /** 1 faces right, -1 is mirrored. */
  facing?: 1 | -1;
  ref?: React.Ref<ClovieCharacterHandle>;
  testID?: string;
}

const REAL_CLOCK: BlinkClock = {
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export function ClovieCharacter({
  emotion,
  size = DESIGN,
  isActive = false,
  blink = 'event',
  isSearching = false,
  isCatching = false,
  facing = 1,
  ref,
  testID,
}: ClovieCharacterProps) {
  const { isDark } = useAppColorScheme();
  const isReduced = useReduceMotion();
  const pose = poseFor(emotion);
  const compiled = compiledPose(emotion);
  const isRunning = isActive && !isReduced;

  const phase = useLoop(pose.loopMs, isRunning && pose.loopMs > 0);
  const poseStyle = useAnimatedStyle(() => {
    const loop = isRunning
      ? sampleFrames(compiled, phase.value)
      : { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, op: 1 };
    const p = composePose(pose.base, loop);
    return {
      transform: [
        { translateX: p.tx },
        { translateY: p.ty },
        { rotate: `${p.rot}deg` },
        { scaleX: p.sx },
        { scaleY: p.sy },
      ],
    };
  });

  const flip = useSharedValue(facing);
  React.useEffect(() => {
    flip.value = isReduced
      ? facing
      : withTiming(facing, {
          duration: 350,
          easing: Easing.bezier(0.32, 0.72, 0, 1),
        });
  }, [facing, flip, isReduced]);
  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: flip.value }],
  }));

  // Eyelids: two body-colour ovals, scaleY from the top.
  const lid = useSharedValue(pose.lidRest);
  const isSleepy = emotion === 'sleepy';
  const doBlink = React.useCallback(() => {
    if (isSleepy) {
      lid.value = withSequence(
        withTiming(1, { duration: BLINK.sleepyCloseMs, easing: BLINK_EASE }),
        withTiming(1, { duration: BLINK.sleepyHoldMs }),
        withTiming(0.5, { duration: BLINK.sleepyOpenMs, easing: BLINK_EASE }),
      );
      return;
    }
    lid.value = withSequence(
      withTiming(1, { duration: BLINK.closeMs, easing: BLINK_EASE }),
      withTiming(0, { duration: BLINK.openMs, easing: BLINK_EASE }),
    );
  }, [isSleepy, lid]);

  React.useEffect(() => {
    lid.value = pose.lidRest;
  }, [lid, pose.lidRest]);

  const canBlink = blink !== 'off' && !isReduced;
  React.useImperativeHandle(
    ref,
    () => ({ blinkOnce: () => (canBlink ? doBlink() : undefined) }),
    [canBlink, doBlink],
  );

  const isAutoBlinking = blink === 'auto' && isActive && !isReduced;
  React.useEffect(() => {
    if (!isAutoBlinking) return;
    return startBlinkLoop({
      random: Math.random,
      clock: REAL_CLOCK,
      isSleepy: () => isSleepy,
      onBlink: doBlink,
    });
  }, [isAutoBlinking, isSleepy, doBlink]);

  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: lid.value }],
  }));

  const kinds = propsFor(emotion, { isSearching, isCatching });
  const scale = size / DESIGN;
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <View style={[styles.box, { transform: [{ scale }] }]}>
        <View style={styles.shadow} />
        <Animated.View style={[styles.poseBox, poseStyle]}>
          <Animated.View style={flipStyle}>
            <View style={pose.isDimmed ? styles.dimmed : undefined}>
              <Image
                source={
                  isDark
                    ? require('@/assets/images/companion-default-dark.png')
                    : require('@/assets/images/companion-default.png')
                }
                resizeMode="contain"
                fadeDuration={0}
                style={styles.image}
              />
              <Animated.View style={[styles.lid, styles.lidLeft, lidStyle]} />
              <Animated.View style={[styles.lid, styles.lidRight, lidStyle]} />
            </View>
          </Animated.View>
          <ClovieProps kinds={kinds} isRunning={isRunning} facing={facing} />
        </Animated.View>
      </View>
    </View>
  );
}

const lidBase = {
  top: `${EYES.y - EYES.h / 2}%`,
  width: `${EYES.w}%`,
  height: `${EYES.h}%`,
} as const;

const styles = StyleSheet.create({
  box: {
    width: DESIGN,
    height: DESIGN,
    transformOrigin: '0% 0%',
  },
  poseBox: {
    width: DESIGN,
    height: DESIGN,
    transformOrigin: '50% 100%',
  },
  shadow: {
    position: 'absolute',
    left: 14,
    bottom: -4,
    width: 56,
    height: 8,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.35)',
    filter: [{ blur: 3 }],
  },
  image: { width: DESIGN, height: DESIGN },
  dimmed: { filter: [{ brightness: 0.74 }, { saturate: 0.75 }] },
  lid: {
    position: 'absolute',
    ...lidBase,
    borderRadius: 999,
    backgroundColor: EYES.lidColor,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 0,
        blurRadius: 3,
        spreadDistance: 1,
        color: EYES.lidColor,
      },
    ],
    transformOrigin: '50% 0%',
  },
  lidLeft: { left: `${EYES.leftX - EYES.w / 2}%` },
  lidRight: { left: `${EYES.rightX - EYES.w / 2}%` },
});
