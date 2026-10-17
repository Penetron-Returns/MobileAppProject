import * as React from 'react';

import { turnPhase } from './turnPhase';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

const PERSPECTIVE = 1400;
const CUBE_DEG = 78;

interface TurnFaceProps {
  /** `in` arrives, `out` leaves. A settled face is an `in` face with `turn` at 1. */
  role: 'in' | 'out';
  kind: 'card' | 'story';
  dir: 1 | -1;
  /** The monotonic turn timeline and this face's committed transition count. */
  turn: SharedValue<number>;
  turnId: number;
  width: number;
  isReduced: boolean;
  /** True while both faces are mounted: the face is cached as one bitmap and only that bitmap moves. */
  isTransitioning: boolean;
  children: React.ReactNode;
}

/**
 * One face of the story cube. Between stories the faces turn like a cube
 * (translate plus 78 degree rotateY under perspective, hinged on the shared
 * edge). Between cards they slide 28 / 20 pt and fade. Reduce Motion: a plain
 * crossfade, no travel. Only transform and opacity animate, and the face is
 * rasterised for the duration so no frame re-draws its content.
 */
export const TurnFace = React.memo(function TurnFace({
  role,
  kind,
  dir,
  turn,
  turnId,
  width,
  isReduced,
  isTransitioning,
  children,
}: TurnFaceProps) {
  const isIn = role === 'in';
  const isCube = kind === 'story' && !isReduced;
  const style = useAnimatedStyle(() => {
    const p = turnPhase(turn.value, turnId);
    if (isReduced) return { opacity: isIn ? p : 1 - p };
    if (isCube) {
      const k = isIn ? 1 - p : p;
      const sign = isIn ? dir : -dir;
      return {
        transform: [
          { perspective: PERSPECTIVE },
          { translateX: sign * width * k },
          { rotateY: `${sign * CUBE_DEG * k}deg` },
        ],
      };
    }
    return isIn
      ? { opacity: p, transform: [{ translateX: dir * 28 * (1 - p) }] }
      : { opacity: 1 - p, transform: [{ translateX: -dir * 20 * p }] };
  });
  const origin = !isCube
    ? '50% 50%'
    : isIn
      ? dir > 0
        ? '0% 50%'
        : '100% 50%'
      : dir > 0
        ? '100% 50%'
        : '0% 50%';
  return (
    <Animated.View
      pointerEvents="none"
      renderToHardwareTextureAndroid={isTransitioning}
      shouldRasterizeIOS={isTransitioning}
      style={[StyleSheet.absoluteFill, { transformOrigin: origin }, style]}
    >
      {children}
    </Animated.View>
  );
});
