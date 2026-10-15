import * as React from 'react';
import { View } from 'react-native';

import { haptics } from '../lib/haptics';
import { Pressable } from '../primitives/Pressable';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

const ITEM = 36;
const OFFSETS = [-2, -1, 0, 1, 2] as const;
const OPACITY = [1, 0.55, 0.25] as const;
const MINUTE_STEP = 15;

export interface TimeWheelProps {
  /** "HH:mm". */
  value: string;
  onChange: (value: string) => void;
  /** First and last hour on offer (board: 5 to 22). */
  minHour?: number;
  maxHour?: number;
  /** Spoken names of the hour and minute rows. */
  hourLabel: (hour: string) => string;
  minuteLabel: (minutes: string) => string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The inline hour : minute picker of the Hours board: five rows per column,
 * the middle one selected under a soft bar, neighbours fading out. Tap a row
 * to move there (hours step by one, minutes by 15).
 */
export function TimeWheel({
  value,
  onChange,
  minHour = 5,
  maxHour = 22,
  hourLabel,
  minuteLabel,
}: TimeWheelProps) {
  const depth = useDepth();
  const [hh, mm] = value.split(':').map(Number);
  const minuteIndex = Math.round(mm / MINUTE_STEP);
  // One tick per row moved, like the wheel's detents.
  const tick = (next: string) => {
    haptics.selection();
    onChange(next);
  };
  return (
    <Surface variant="wheel" radius={16} className="h-[180px] overflow-hidden">
      <Surface
        variant="wheelSelection"
        radius={10}
        pointerEvents="none"
        className="absolute left-2 right-2 top-[72px] h-9"
      />
      <View className="h-[180px] flex-row">
        <View className="flex-1 items-end pr-[22px]">
          {OFFSETS.map((offset) => {
            const hour = hh + offset;
            const ok = hour >= minHour && hour <= maxHour;
            return (
              <WheelItem
                key={offset}
                align="right"
                offset={offset}
                label={ok ? pad(hour) : ''}
                accessibilityLabel={ok ? hourLabel(pad(hour)) : undefined}
                onPress={ok ? () => tick(`${pad(hour)}:${pad(mm)}`) : null}
                color={depth.colors.label}
              />
            );
          })}
        </View>
        <Text
          importantForAccessibility="no"
          style={{ lineHeight: ITEM, fontSize: 21 }}
          className="w-2.5 pt-[72px] font-semibold"
        >
          :
        </Text>
        <View className="flex-1 items-start pl-[22px]">
          {OFFSETS.map((offset) => {
            const index = minuteIndex + offset;
            const ok = index >= 0 && index <= 3;
            const minutes = pad(index * MINUTE_STEP);
            return (
              <WheelItem
                key={offset}
                align="left"
                offset={offset}
                label={ok ? minutes : ''}
                accessibilityLabel={ok ? minuteLabel(minutes) : undefined}
                onPress={ok ? () => tick(`${pad(hh)}:${minutes}`) : null}
                color={depth.colors.label}
              />
            );
          })}
        </View>
      </View>
      <Surface
        variant="wheelTop"
        pointerEvents="none"
        className="absolute left-0 right-0 top-0 h-[60px]"
      />
      <Surface
        variant="wheelBottom"
        pointerEvents="none"
        className="absolute bottom-0 left-0 right-0 h-[60px]"
      />
    </Surface>
  );
}

function WheelItem({
  align,
  offset,
  label,
  accessibilityLabel,
  onPress,
  color,
}: {
  align: 'left' | 'right';
  offset: (typeof OFFSETS)[number];
  label: string;
  accessibilityLabel?: string;
  onPress: (() => void) | null;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress ?? undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      importantForAccessibility={onPress ? 'yes' : 'no-hide-descendants'}
      feedback="none"
      style={{ opacity: OPACITY[Math.abs(offset)] }}
      className="h-9 w-[70px]"
    >
      <Text
        style={{
          color,
          fontSize: 21,
          lineHeight: ITEM,
          textAlign: align,
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
