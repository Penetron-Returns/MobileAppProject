import * as React from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../lib/haptics';
import { Pressable } from '../primitives/Pressable';
import { useDepth } from '../theme/useDepth';
import { DURATION, springConfig, timingConfig } from '../tokens/motion';

const TRACK_W = 51;
const TRACK_H = 31;
const KNOB = 27;
const KNOB_OFF = 2;
const KNOB_ON = 22;

const ON_GRADIENT = 'linear-gradient(180deg, #3BD16F 0%, #2DB45B 100%)';
const ON_SHADOW =
  'inset 0 1px 2px rgba(0,0,0,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.08)';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Spoken name of the setting. Required: a bare switch says nothing. */
  accessibilityLabel: string;
  disabled?: boolean;
}

/**
 * The design's 51x31 pill switch (green when on, pressed-in track when off).
 * The thumb springs across and the green track fades in over the inset one;
 * both honour reduced motion.
 */
export function Switch({
  checked,
  onCheckedChange,
  accessibilityLabel,
  disabled,
}: SwitchProps) {
  const depth = useDepth();
  const progress = useSharedValue(checked ? 1 : 0);
  React.useEffect(() => {
    progress.value = withSpring(checked ? 1 : 0, springConfig('snappy'));
  }, [checked, progress]);
  const fill = useSharedValue(checked ? 1 : 0);
  React.useEffect(() => {
    fill.value = withTiming(checked ? 1 : 0, timingConfig(DURATION.quick));
  }, [checked, fill]);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (KNOB_ON - KNOB_OFF) }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onCheckedChange(!checked);
      }}
      disabled={disabled}
      feedback="none"
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      style={[
        depth.inset,
        { width: TRACK_W, height: TRACK_H, borderRadius: 16 },
        disabled && { opacity: 0.5 },
      ]}
      // Size also as classes so a row can never squeeze the track out of its card.
      className="h-[31px] w-[51px] shrink-0"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: 16,
            backgroundColor: depth.colors.success,
            experimental_backgroundImage: ON_GRADIENT,
            boxShadow: ON_SHADOW,
          },
          fillStyle,
        ]}
      />
      <Animated.View
        style={[
          depth.thumb,
          {
            position: 'absolute',
            top: 2,
            left: KNOB_OFF,
            width: KNOB,
            height: KNOB,
            borderRadius: 14,
          },
          thumbStyle,
        ]}
      />
    </Pressable>
  );
}
