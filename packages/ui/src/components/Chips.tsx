import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { cn } from '../lib/cn';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { RADII } from '../tokens/radii';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /**
   * `filter` is a row of single-select filters (radio semantics, 40pt pill);
   * `time` is a bookable time or staff pill (button semantics, 76pt wide).
   */
  variant?: 'filter' | 'time';
  accessibilityLabel?: string;
}

/** A selectable pill. Selected = tactile tint, otherwise raised. */
export function Chip({
  label,
  selected,
  onPress,
  variant = 'time',
  accessibilityLabel,
}: ChipProps) {
  const depth = useDepth();
  const isFilter = variant === 'filter';
  return (
    <Pressable
      onPress={onPress}
      feedback="none"
      accessibilityRole={isFilter ? 'radio' : 'button'}
      accessibilityState={
        isFilter ? { selected, checked: selected } : { selected }
      }
      accessibilityLabel={accessibilityLabel ?? label}
      className={cn('min-h-11 justify-center', !isFilter && 'min-w-[76px]')}
    >
      <View
        style={[
          selected ? depth.primary : depth.button,
          { borderRadius: isFilter ? RADII.pill : RADII.full },
        ]}
        className={cn(
          'items-center justify-center px-4',
          isFilter ? 'h-10' : 'h-11',
        )}
      >
        <Text
          style={
            isFilter
              ? undefined
              : {
                  color: selected ? depth.colors.onFill : depth.colors.label,
                  fontVariant: ['tabular-nums'],
                }
          }
          className={cn(
            isFilter ? 'text-subtitle' : 'text-title',
            'font-semibold',
            isFilter && selected && 'text-primary-foreground',
          )}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export interface ChipOption<V extends string> {
  value: V;
  label: string;
}

export interface ChipsProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: readonly ChipOption<V>[];
  /** Accessible name of the whole group. */
  label: string;
}

/** Single-select filter chips in a horizontally scrolling row. */
export function Chips<V extends string>({
  value,
  onChange,
  options,
  label,
}: ChipsProps<V>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerClassName="gap-2 px-5"
      className="mt-3 grow-0"
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          variant="filter"
          label={option.label}
          selected={option.value === value}
          onPress={() => onChange(option.value)}
        />
      ))}
    </ScrollView>
  );
}
