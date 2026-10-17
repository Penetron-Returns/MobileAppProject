import * as React from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BRAND } from '@/features/brand/brandColors';
import { ClovieAnimated } from '@/features/brand/ClovieAnimated';
import { useMotionActive } from '@/hooks/useMotionActive';

import { LOOPS, REST, poseAt, type ClovieMood } from '../reaction';

/** The four-point star of the boards, in their 24pt viewBox. */
const STAR = 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z';

/** [size, left, top, delay ms] of the three sparkles on the 120pt board, scaled to the figure. */
const SPARKLES = [
  [24, 114, 0, 0],
  [16, 100, -6, 500],
  [17, -4, 22, 900],
] as const;

/** A sparkle twinkles opacity .25 to 1 and scale .7 to 1 (1.8s). Static and full under Reduce Motion. */
function Sparkle({
  size,
  left,
  top,
  delay,
  isActive,
}: {
  size: number;
  left: number;
  top: number;
  delay: number;
  isActive: boolean;
}) {
  const t = useSharedValue(1);
  React.useEffect(() => {
    if (!isActive) {
      cancelAnimation(t);
      t.value = 1;
      return;
    }
    t.value = 0;
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 900 }), -1, true),
    );
    return () => cancelAnimation(t);
  }, [isActive, delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.75 * t.value,
    transform: [{ scale: 0.7 + 0.3 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left, top, width: size, height: size },
        style,
      ]}
    >
      <Svg viewBox="0 0 24 24" width={size} height={size}>
        <Path d={STAR} fill={BRAND.blue} />
      </Svg>
    </Animated.View>
  );
}

/**
 * The existing Clovie character with a board "reaction": a tilt, hop, wave or
 * breath done as transforms of the whole figure, pivoting at its feet.
 * Decorative. Reduce Motion (or a hidden screen) holds the mood's still pose.
 */
export function ClovieReaction({
  mood,
  size,
  sparkles = false,
}: {
  mood: ClovieMood;
  size: number;
  sparkles?: boolean;
}) {
  const isMotion = useMotionActive();
  const loop = LOOPS[mood];
  const p = useSharedValue(0);

  React.useEffect(() => {
    cancelAnimation(p);
    p.value = 0;
    if (!isMotion || !loop) return;
    p.value = withRepeat(
      withTiming(1, { duration: loop.periodMs, easing: Easing.linear }),
      loop.repeat,
    );
    return () => cancelAnimation(p);
  }, [isMotion, loop, p]);

  const style = useAnimatedStyle(() => {
    const pose = isMotion && loop ? poseAt(mood, p.value) : REST[mood];
    return {
      transform: [
        { translateY: size / 2 },
        { scale: pose.scale },
        { rotate: `${pose.rotate}deg` },
        { translateY: -size / 2 },
        { translateY: pose.y },
      ],
    };
  });

  const f = size / 120;
  return (
    <View
      testID={`clovie-reaction-${mood}`}
      style={{ width: size, height: size }}
    >
      <Animated.View style={style}>
        <ClovieAnimated size={size} />
      </Animated.View>
      {sparkles
        ? SPARKLES.map(([s, left, top, delay]) => (
            <Sparkle
              key={delay}
              size={Math.round(s * f)}
              left={Math.round(left * f)}
              top={Math.round(top * f)}
              delay={delay}
              isActive={isMotion}
            />
          ))
        : null}
    </View>
  );
}
