import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { haptics } from '../lib/haptics';
import { Pressable } from '../primitives/Pressable';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { IconButton } from './IconButton';

/** One day of the month, already formatted by the caller (the kit knows no calendar). */
export interface MonthCell {
  /** Stable id, e.g. the ISO date. */
  value: string;
  /** "14" */
  label: string;
  /** "Monday 14 October" */
  accessibilityLabel: string;
  selected?: boolean;
  today?: boolean;
  disabled?: boolean;
}

export interface MonthGridProps {
  /** "October 2026" */
  title: string;
  /** Seven short weekday names, in the order of the columns. */
  weekdays: readonly string[];
  /** Rows of seven; `null` pads the days outside the month. */
  weeks: readonly (readonly (MonthCell | null)[])[];
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
  disablePrevious?: boolean;
  onSelect: (value: string) => void;
}

/**
 * A month of days to pick one from, in the pressed-in well of the time wheel:
 * previous and next month, a row of weekday names and 44pt day cells. The
 * chosen day is the tint pill, today is tinted text.
 */
export function MonthGrid({
  title,
  weekdays,
  weeks,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  disablePrevious,
  onSelect,
}: MonthGridProps) {
  const depth = useDepth();
  return (
    <Surface variant="wheel" radius={16} className="px-2 pb-2 pt-1">
      <View className="flex-row items-center justify-between">
        <IconButton
          icon={ChevronLeft}
          variant="plain"
          tone="label"
          label={previousLabel}
          onPress={onPrevious}
          disabled={disablePrevious}
        />
        <Text
          role="heading"
          aria-level="3"
          accessibilityLiveRegion="polite"
          className="text-title font-semibold"
        >
          {title}
        </Text>
        <IconButton
          icon={ChevronRight}
          variant="plain"
          tone="label"
          label={nextLabel}
          onPress={onNext}
        />
      </View>
      <View
        className="flex-row"
        importantForAccessibility="no-hide-descendants"
      >
        {weekdays.map((name, i) => (
          <Text
            key={i}
            style={{ color: depth.colors.secondary }}
            className="flex-1 text-center text-meta font-semibold"
          >
            {name}
          </Text>
        ))}
      </View>
      {weeks.map((week, row) => (
        <View key={row} className="flex-row">
          {week.map((cell, col) =>
            cell ? (
              <Pressable
                key={cell.value}
                onPress={() => {
                  haptics.selection();
                  onSelect(cell.value);
                }}
                disabled={cell.disabled}
                accessibilityRole="button"
                accessibilityLabel={cell.accessibilityLabel}
                accessibilityState={{
                  selected: Boolean(cell.selected),
                  disabled: Boolean(cell.disabled),
                }}
                feedback="none"
                className="h-11 flex-1 items-center justify-center"
              >
                <View
                  style={cell.selected ? depth.primary : undefined}
                  className="h-10 w-10 items-center justify-center rounded-full"
                >
                  <Text
                    style={{
                      color: cell.selected
                        ? depth.colors.onFill
                        : cell.today
                          ? depth.colors.tint
                          : depth.colors.label,
                      fontVariant: ['tabular-nums'],
                      opacity: cell.disabled ? 0.3 : 1,
                    }}
                    className={
                      cell.selected || cell.today
                        ? 'text-title font-semibold'
                        : 'text-title'
                    }
                  >
                    {cell.label}
                  </Text>
                </View>
              </Pressable>
            ) : (
              <View key={`pad-${col}`} className="h-11 flex-1" />
            ),
          )}
        </View>
      ))}
    </Surface>
  );
}
