import * as React from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
  /** Longer spoken name when the visible label is short ("Day" -> "Day view"). */
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  /** Spoken name of the whole control. */
  label: string;
  className?: string;
}

/**
 * iOS-style single-select segmented control (Calendar Day/Week, a filter):
 * a pressed-in track with the selected segment raised as a knob.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: SegmentedControlProps<T>) {
  const depth = useDepth();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[depth.inset, { borderRadius: 12 }]}
      className={cn('flex-row items-center p-0.5', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            onPress={() => onChange(option.value)}
            style={selected ? [depth.knob, { borderRadius: 10 }] : undefined}
            className="min-h-11 flex-1 items-center justify-center px-3"
          >
            <Text className="text-subtitle font-semibold">{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
