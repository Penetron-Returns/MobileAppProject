import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { haptics } from '../lib/haptics';
import { Skeleton } from '../primitives/Skeleton';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { Chip } from './Chips';

/** A bookable day, already formatted by the caller (the kit knows no calendar). */
export interface SlotDay {
  /** Stable id, e.g. the ISO date. */
  value: string;
  /** "Mon" */
  weekday: string;
  /** "14" */
  day: string;
  /** "Monday 14 October" */
  accessibilityLabel: string;
}

/** A bookable time, already formatted by the caller. */
export interface SlotTime {
  /** Stable id, e.g. the ISO instant. */
  value: string;
  /** "10:30" */
  label: string;
}

export interface DayChipsProps {
  days: readonly SlotDay[];
  selected: string | null;
  onSelect: (value: string) => void;
  /** Spoken name of the row of days. */
  label: string;
}

/** A horizontally scrolling row of day tiles (weekday over date). */
export function DayChips({ days, selected, onSelect, label }: DayChipsProps) {
  const depth = useDepth();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
      accessibilityLabel={label}
    >
      {days.map((d) => {
        const isSelected = d.value === selected;
        return (
          <Pressable
            key={d.value}
            onPress={() => {
              haptics.selection();
              onSelect(d.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={d.accessibilityLabel}
            style={isSelected ? depth.primary : depth.button}
            className="min-h-14 w-14 items-center justify-center rounded-2xl"
          >
            <Text
              style={{
                color: isSelected
                  ? depth.colors.onFill
                  : depth.colors.secondary,
              }}
              className="text-meta font-semibold"
            >
              {d.weekday}
            </Text>
            <Text
              style={{
                color: isSelected ? depth.colors.onFill : depth.colors.label,
              }}
              className="text-title font-semibold"
            >
              {d.day}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export interface TimeChipsProps {
  times: readonly SlotTime[];
  selected: string | null;
  onSelect: (value: string) => void;
  /** Spoken name of the group of times. */
  label: string;
}

/** The wrapped grid of time pills for the chosen day. */
export function TimeChips({
  times,
  selected,
  onSelect,
  label,
}: TimeChipsProps) {
  return (
    <View accessibilityLabel={label} className="flex-row flex-wrap gap-2">
      {times.map((time) => (
        <Chip
          key={time.value}
          label={time.label}
          selected={selected === time.value}
          onPress={() => onSelect(time.value)}
        />
      ))}
    </View>
  );
}

/** Placeholder shaped like the day row and the time grid while availability loads. */
export function SlotSkeleton({ label }: { label: string }) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      className="gap-3"
    >
      <View className="flex-row gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-14 rounded-2xl" />
        ))}
      </View>
      <View className="flex-row gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-[76px] rounded-full" />
        ))}
      </View>
    </View>
  );
}
