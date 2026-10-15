import * as React from 'react';
import { View } from 'react-native';

import { Pressable } from '../primitives/Pressable';
import { useDepth } from '../theme/useDepth';

const TRACK_W = 51;
const TRACK_H = 31;
const KNOB = 27;

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

/** The design's 51x31 pill switch (green when on, pressed-in track when off). */
export function Switch({
  checked,
  onCheckedChange,
  accessibilityLabel,
  disabled,
}: SwitchProps) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={() => onCheckedChange(!checked)}
      disabled={disabled}
      feedback="none"
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
      style={[
        checked
          ? {
              backgroundColor: depth.colors.success,
              experimental_backgroundImage: ON_GRADIENT,
              boxShadow: ON_SHADOW,
            }
          : depth.inset,
        { width: TRACK_W, height: TRACK_H, borderRadius: 16 },
        disabled && { opacity: 0.5 },
      ]}
      // Size also as classes so a row can never squeeze the track out of its card.
      className="h-[31px] w-[51px] shrink-0"
    >
      <View
        style={[
          depth.thumb,
          {
            position: 'absolute',
            top: 2,
            left: checked ? 22 : 2,
            width: KNOB,
            height: KNOB,
            borderRadius: 14,
          },
        ]}
      />
    </Pressable>
  );
}
