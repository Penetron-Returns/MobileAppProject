import * as React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The canvas scenes are written as 0 to 100 % keyframes of a loop; the events
 * all happen in the first 60 %. A play-once run maps that span onto `progress`
 * 0..1, so a scene reads exactly like its canvas keyframes.
 */
export const SPAN = 60;

/**
 * Animatable properties. `to` defaults to the identity pose for opacity and
 * transforms; width, height, left and top need an explicit `to`.
 */
export interface Pose {
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

const REST: Required<
  Pick<Pose, 'opacity' | 'x' | 'y' | 'scale' | 'scaleX' | 'scaleY' | 'rotate'>
> = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
};

/** 0..1 for a canvas range (in %), eased out, clamped. */
export function segment(progress: number, from: number, to: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, (progress * SPAN - from) / (to - from)));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

interface TweenProps {
  progress: SharedValue<number>;
  /** Canvas keyframe range in % of the loop, e.g. [12, 40]. */
  range: readonly [number, number];
  from: Pose;
  to?: Pose;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * A view that moves from its `from` pose to its finished pose while `progress`
 * passes `range`. At progress 1 (rest, Reduce Motion) it is exactly its finished
 * style, so the finished frame is the static layout.
 */
export function Tween({
  progress,
  range,
  from,
  to,
  style,
  children,
}: TweenProps) {
  const animated = useAnimatedStyle(() => {
    const t = segment(progress.value, range[0], range[1]);
    const pose: Record<string, number> = {};
    const keys = Object.keys(from) as (keyof Pose)[];
    for (const key of keys) {
      const start = from[key] as number;
      const end = (to?.[key] ?? REST[key as keyof typeof REST]) as number;
      pose[key] = start + (end - start) * t;
    }
    const style: Record<string, unknown> = {};
    const transform: Record<string, number | string>[] = [];
    if (pose.x !== undefined) transform.push({ translateX: pose.x });
    if (pose.y !== undefined) transform.push({ translateY: pose.y });
    if (pose.scale !== undefined) transform.push({ scale: pose.scale });
    if (pose.scaleX !== undefined) transform.push({ scaleX: pose.scaleX });
    if (pose.scaleY !== undefined) transform.push({ scaleY: pose.scaleY });
    if (pose.rotate !== undefined)
      transform.push({ rotate: `${pose.rotate}deg` });
    if (transform.length) style.transform = transform;
    for (const key of ['opacity', 'width', 'height', 'left', 'top']) {
      if (pose[key] !== undefined) style[key] = pose[key];
    }
    return style;
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
