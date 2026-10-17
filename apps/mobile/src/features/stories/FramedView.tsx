import {
  sampleFrames,
  type CompiledFrames,
  type Sampled,
} from '@/features/clovie-character';
import * as React from 'react';
import type { ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

interface FramedViewProps {
  /** One shared 0..1 loop for the whole demo. */
  t: SharedValue<number>;
  frames: CompiledFrames;
  isRunning: boolean;
  /** The still look when not running (Reduce Motion). */
  rest: Sampled;
  origin?: string;
  style?: ViewStyle;
  children?: React.ReactNode;
}

/** A view whose opacity and transform follow keyframes sampled from a shared loop. */
export function FramedView({
  t,
  frames,
  isRunning,
  rest,
  origin,
  style,
  children,
}: FramedViewProps) {
  const animated = useAnimatedStyle(() => {
    const s = isRunning ? sampleFrames(frames, t.value) : rest;
    return {
      opacity: s.op,
      transform: [
        { translateX: s.tx },
        { translateY: s.ty },
        { scaleX: s.sx },
        { scaleY: s.sy },
      ],
    };
  });
  return (
    <Animated.View
      style={[style, origin ? { transformOrigin: origin } : null, animated]}
    >
      {children}
    </Animated.View>
  );
}
