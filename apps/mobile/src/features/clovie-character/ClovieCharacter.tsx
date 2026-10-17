import { useAppColorScheme, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ClovieProps } from './ClovieProps';
import { ClovieSprite } from './ClovieSprite';
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

export interface ClovieCharacterProps {
  emotion: ClovieEmotion;
  /** Layout size in pt. Props spill outside it, so do not clip the parent. */
  size?: number;
  /** Pose and prop loops run only while true. At rest nothing animates. */
  isActive?: boolean;
  /**
   * Draws the blinking companion (pre-rendered frames of the real avatar,
   * one bitmap and a timer during a blink) instead of the still PNG, but only
   * while also `isActive` and Reduce Motion is off.
   */
  isLive?: boolean;
  /** Curious only: shows the magnifier. */
  isSearching?: boolean;
  /** Delighted only: stars fall into his hands. */
  isCatching?: boolean;
  /** 1 faces right, -1 is mirrored. */
  facing?: 1 | -1;
  testID?: string;
}

export const ClovieCharacter = React.memo(function ClovieCharacter({
  emotion,
  size = DESIGN,
  isActive = false,
  isLive = false,
  isSearching = false,
  isCatching = false,
  facing = 1,
  testID,
}: ClovieCharacterProps) {
  const { isDark } = useAppColorScheme();
  const isReduced = useReduceMotion();
  const pose = poseFor(emotion);
  const compiled = compiledPose(emotion);
  const isRunning = isActive && !isReduced;
  const isShowingLive = isLive && isRunning;

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
        <Image
          source={require('@/assets/images/clovie/shadow.png')}
          fadeDuration={0}
          resizeMethod="resize"
          style={styles.shadow}
        />
        <Animated.View style={[styles.poseBox, poseStyle]}>
          <Animated.View style={flipStyle}>
            <View style={pose.isDimmed ? styles.dimmed : undefined}>
              {isShowingLive ? (
                <ClovieSprite size={DESIGN} isActive />
              ) : (
                <Image
                  source={
                    isDark
                      ? require('@/assets/images/companion-default-dark.png')
                      : require('@/assets/images/companion-default.png')
                  }
                  resizeMode="contain"
                  resizeMethod="resize"
                  fadeDuration={0}
                  style={styles.image}
                />
              )}
            </View>
          </Animated.View>
          <ClovieProps kinds={kinds} isRunning={isRunning} facing={facing} />
        </Animated.View>
      </View>
    </View>
  );
});

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
  /** The 56 x 8 pt blurred pill under him, baked into a 72 x 20 pt image (see render-sprites.mjs). */
  shadow: { position: 'absolute', left: 6, top: 74, width: 72, height: 20 },
  image: { width: DESIGN, height: DESIGN },
  dimmed: { filter: [{ brightness: 0.74 }, { saturate: 0.75 }] },
});
