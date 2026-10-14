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
   * `time` is a bookable time or staff pill (button semantics, 76pt wide);
   * `choice` is a 44pt option in a form (radio semantics, raised when off);
   * `toggle` is the same pill for a multi-select (button semantics), with an
   * optional colour dot ("Who does it").
   */
  variant?: 'filter' | 'time' | 'choice' | 'toggle';
  /** Small colour dot before the label (a team member's calendar colour). */
  dotColor?: string | null;
  accessibilityLabel?: string;
}

/** A selectable pill. Selected = tactile tint, otherwise raised. */
export function Chip({
  label,
  selected,
  onPress,
  variant = 'time',
  dotColor,
  accessibilityLabel,
}: ChipProps) {
  const depth = useDepth();
  const isFilter = variant === 'filter';
  const isOption = variant === 'choice' || variant === 'toggle';
  const isRadio = isFilter || variant === 'choice';
  const textStyle = isFilter
    ? undefined
    : {
        color: selected ? depth.colors.onFill : depth.colors.label,
        fontVariant: ['tabular-nums' as const],
      };
  return (
    <Pressable
      onPress={onPress}
      feedback="none"
      accessibilityRole={isRadio ? 'radio' : 'button'}
      accessibilityState={
        isRadio ? { selected, checked: selected } : { selected }
      }
      accessibilityLabel={accessibilityLabel ?? label}
      className={cn(
        'min-h-11 justify-center',
        !isFilter && !isOption && 'min-w-[76px]',
      )}
    >
      <View
        style={[
          selected ? depth.primary : isOption ? depth.raised : depth.button,
          { borderRadius: isFilter ? RADII.pill : RADII.full },
        ]}
        className={cn(
          'items-center justify-center',
          isFilter ? 'h-10 px-4' : 'h-11',
          !isFilter && (dotColor ? 'flex-row gap-2 pl-3.5 pr-[18px]' : 'px-4'),
          isOption && !dotColor && 'px-[18px]',
        )}
      >
        {dotColor ? (
          <View
            style={{ backgroundColor: dotColor }}
            className="h-2 w-2 rounded-full"
          />
        ) : null}
        <Text
          style={textStyle}
          className={cn(
            isFilter ? 'text-subtitle' : 'text-title',
            !isOption && 'font-semibold',
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
