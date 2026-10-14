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
  /**
   * `tabs` switches a view (Calendar Day/Week): 44pt segments. `choice` picks
   * a value in a form row (Role, Category): the board's 40pt pill track with
   * radio semantics.
   */
  variant?: 'tabs' | 'choice';
  className?: string;
}

/**
 * iOS-style single-select segmented control: a pressed-in track with the
 * selected segment raised as a knob.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  variant = 'tabs',
  className,
}: SegmentedControlProps<T>) {
  const depth = useDepth();
  const isChoice = variant === 'choice';
  return (
    <View
      accessibilityRole={isChoice ? 'radiogroup' : 'tablist'}
      accessibilityLabel={label}
      style={[depth.inset, { borderRadius: isChoice ? 20 : 12 }]}
      className={cn(
        'flex-row items-center p-0.5',
        isChoice && 'h-10',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={isChoice ? 'radio' : 'tab'}
            accessibilityState={
              isChoice ? { checked: selected, selected } : { selected }
            }
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            onPress={() => onChange(option.value)}
            // The 40pt pill reaches the 44pt target through its slop.
            hitSlop={isChoice ? { top: 2, bottom: 2 } : undefined}
            style={
              selected
                ? [depth.segment, { borderRadius: isChoice ? 18 : 10 }]
                : undefined
            }
            className={cn(
              'flex-1 items-center justify-center',
              isChoice ? 'h-9' : 'min-h-11 px-3',
            )}
          >
            <Text
              className={cn(
                'text-subtitle',
                selected || !isChoice ? 'font-semibold' : 'font-medium',
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
