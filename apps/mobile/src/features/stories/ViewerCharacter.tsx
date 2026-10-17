import { useReduceMotion } from '@booking/ui';
import {
  ClovieCharacter,
  compileFrames,
  sampleFrames,
  type ClovieEmotion,
} from '@/features/clovie-character';
import * as React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EASE_SPRING } from './motion';
import { TRAVEL_MS } from './progress';

/** How Clovie is travelling: a walk between cards, or leaving and landing across a story seam. */
export type TravelMode = 'walk' | 'exit' | 'enter';

export interface Travel {
  /** Bumps on every move so the same mode can replay. */
  id: number;
  mode: TravelMode;
  /** 1 when moving forwards (he leaves right), -1 back. */
  dir: 1 | -1;
}

export interface CharacterTarget {
  x: number;
  y: number;
  scale: number;
  facing: 1 | -1;
}

const SIZE = 84;
const EXIT_MS = 380;
/** The board's squash-and-stretch hop (0.85 s) and the walk waddle (0.9 s). */
const HOP = compileFrames([
  { at: 0, ty: 0, sx: 1, sy: 1 },
  { at: 0.16, ty: 4, sx: 1.1, sy: 0.88 },
  { at: 0.42, ty: -38, sx: 0.92, sy: 1.14 },
  { at: 0.72, ty: 0, sx: 1.1, sy: 0.9 },
  { at: 0.86, ty: -6, sx: 0.98, sy: 1.03 },
  { at: 1, ty: 0, sx: 1, sy: 1 },
]);
const WALK = compileFrames([
  { at: 0, ty: 0, rot: 0 },
  { at: 0.14, ty: -9, rot: -6 },
  { at: 0.28, ty: 0, rot: 0 },
  { at: 0.42, ty: -9, rot: 6 },
  { at: 0.56, ty: 0, rot: 0 },
  { at: 0.7, ty: -9, rot: -6 },
  { at: 0.84, ty: 0, rot: 0 },
  { at: 1, ty: 0, rot: 0 },
]);
const HOP_MS = 850;
const WALK_MS = 900;

interface ViewerCharacterProps {
  emotion: ClovieEmotion;
  target: CharacterTarget;
  travel: Travel;
  screenWidth: number;
  isSearching: boolean;
  isCatching: boolean;
}

/**
 * The one persistent Clovie. He is never remounted: he walks (with a waddle)
 * to each card's spot with an 850 ms spring, and hops off the edge and back in
 * across a story change. Reduce Motion: he just appears at the new spot.
 */
export function ViewerCharacter({
  emotion,
  target,
  travel,
  screenWidth,
  isSearching,
  isCatching,
}: ViewerCharacterProps) {
  const isReduced = useReduceMotion();
  const x = useSharedValue(target.x);
  const y = useSharedValue(target.y);
  const s = useSharedValue(target.scale);
  const motion = useSharedValue(0);
  const kind = useSharedValue(0);
  const isFirst = React.useRef(true);

  React.useEffect(() => {
    if (isFirst.current || isReduced) {
      isFirst.current = false;
      x.value = target.x;
      y.value = target.y;
      s.value = target.scale;
      return;
    }
    const spring = { duration: TRAVEL_MS, easing: EASE_SPRING };
    const play = (ms: number, hop: boolean) => {
      kind.value = hop ? 1 : 0;
      motion.value = 0;
      motion.value = withTiming(1, { duration: ms, easing: Easing.linear });
    };
    if (travel.mode === 'exit') {
      play(HOP_MS, true);
      const off = travel.dir > 0 ? screenWidth + 38 : -SIZE - 38;
      x.value = withTiming(off, { duration: EXIT_MS, easing: EASE_SPRING });
      return;
    }
    if (travel.mode === 'enter') {
      play(HOP_MS, true);
      // Already off the edge: land from the side he left on, then settle.
      x.value = withTiming(target.x, spring);
    } else {
      play(WALK_MS, false);
      x.value = withTiming(target.x, spring);
    }
    y.value = withTiming(target.y, spring);
    s.value = withTiming(target.scale, { duration: 500, easing: EASE_SPRING });
    // Only a new move retargets him; the target is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travel.id, travel.mode]);

  const style = useAnimatedStyle(() => {
    const f = sampleFrames(kind.value === 1 ? HOP : WALK, motion.value);
    return {
      transform: [
        { translateX: x.value },
        { translateY: y.value + f.ty },
        { rotate: `${f.rot}deg` },
        { scaleX: s.value * f.sx },
        { scaleY: s.value * f.sy },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]}>
      <ClovieCharacter
        emotion={emotion}
        size={SIZE}
        isActive
        isLive
        facing={target.facing}
        isSearching={isSearching}
        isCatching={isCatching}
        testID="story-clovie"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    transformOrigin: '50% 100%',
  },
});
