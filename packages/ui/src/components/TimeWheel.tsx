import * as React from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics } from '../lib/haptics';
import { Pressable } from '../primitives/Pressable';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

const ITEM = 36;
/** Rows kept either side of the middle, so a flick has content to scroll through. */
const REACH = 4;
const OFFSETS = Array.from({ length: REACH * 2 + 1 }, (_, i) => i - REACH);
const MINUTE_STEP = 15;
/** How far a flick carries on after the finger lifts, in seconds of velocity. */
const FLING_SECONDS = 0.12;
const SNAP_MS = 140;

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

interface WheelRow {
  label: string;
  accessibilityLabel?: string;
  onPress: (() => void) | null;
}

/**
 * The inline hour : minute picker of the Hours board: five rows per column,
 * the middle one selected under a soft bar, neighbours fading out. Tap a row
 * to move there, or drag or flick a column (the rows follow the finger on the
 * UI thread and settle on a row). Hours step by one, minutes by 15.
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
  const hourRows = OFFSETS.map((offset): WheelRow => {
    const hour = hh + offset;
    const ok = hour >= minHour && hour <= maxHour;
    return {
      label: ok ? pad(hour) : '',
      accessibilityLabel: ok ? hourLabel(pad(hour)) : undefined,
      onPress: ok ? () => tick(`${pad(hour)}:${pad(mm)}`) : null,
    };
  });
  const minuteRows = OFFSETS.map((offset): WheelRow => {
    const index = minuteIndex + offset;
    const ok = index >= 0 && index <= 3;
    const minutes = pad(index * MINUTE_STEP);
    return {
      label: ok ? minutes : '',
      accessibilityLabel: ok ? minuteLabel(minutes) : undefined,
      onPress: ok ? () => tick(`${pad(hh)}:${minutes}`) : null,
    };
  });
  return (
    <Surface variant="wheel" radius={16} className="h-[180px] overflow-hidden">
      <Surface
        variant="wheelSelection"
        radius={10}
        pointerEvents="none"
        className="absolute left-2 right-2 top-[72px] h-9"
      />
      <View className="h-[180px] flex-row">
        <WheelColumn
          align="right"
          rows={hourRows}
          rowsBefore={hh - minHour}
          rowsAfter={maxHour - hh}
          resetKey={hh}
          onStep={(steps) => tick(`${pad(hh + steps)}:${pad(mm)}`)}
          color={depth.colors.label}
        />
        <Text
          importantForAccessibility="no"
          style={{ lineHeight: ITEM, fontSize: 21 }}
          className="w-2.5 pt-[72px] font-semibold"
        >
          :
        </Text>
        <WheelColumn
          align="left"
          rows={minuteRows}
          rowsBefore={minuteIndex}
          rowsAfter={3 - minuteIndex}
          resetKey={minuteIndex}
          onStep={(steps) =>
            tick(`${pad(hh)}:${pad((minuteIndex + steps) * MINUTE_STEP)}`)
          }
          color={depth.colors.label}
        />
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

/**
 * Rows moved by a drag of `translation` plus a flick of `velocity`, kept
 * inside the rows that exist. Dragging up (negative) moves forward.
 */
export function wheelSteps(
  translation: number,
  velocity: number,
  rowsBefore: number,
  rowsAfter: number,
): number {
  'worklet';
  const projected = translation + velocity * FLING_SECONDS;
  const steps = Math.round(-projected / ITEM);
  // `+ 0` turns a -0 into 0.
  return Math.max(-rowsBefore, Math.min(rowsAfter, steps)) + 0;
}

/** Opacity of a row `distance` rows from the middle: 1, then 0.55, then 0.25. */
function rowOpacity(distance: number): number {
  'worklet';
  return interpolate(distance, [0, 1, 2], [1, 0.55, 0.25], Extrapolation.CLAMP);
}

function WheelColumn({
  align,
  rows,
  rowsBefore,
  rowsAfter,
  resetKey,
  onStep,
  color,
}: {
  align: 'left' | 'right';
  rows: WheelRow[];
  /** How many rows exist before and after the selected one (the drag range). */
  rowsBefore: number;
  rowsAfter: number;
  /** Changes when the value does: the rows are re-centred then. */
  resetKey: number;
  onStep: (steps: number) => void;
  color: string;
}) {
  const shift = useSharedValue(0);
  const detent = useSharedValue(0);
  // The value moved, so the rows re-centre: drop the drag offset with them.
  React.useLayoutEffect(() => {
    shift.value = 0;
    detent.value = 0;
  }, [resetKey, shift, detent]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onUpdate((e) => {
          'worklet';
          const lowest = -rowsAfter * ITEM;
          const highest = rowsBefore * ITEM;
          shift.value = Math.max(lowest, Math.min(highest, e.translationY));
          const crossed = Math.round(-shift.value / ITEM);
          if (crossed !== detent.value) {
            detent.value = crossed;
            runOnJS(haptics.selection)();
          }
        })
        .onEnd((e) => {
          'worklet';
          const steps = wheelSteps(
            e.translationY,
            e.velocityY,
            rowsBefore,
            rowsAfter,
          );
          shift.value = withTiming(
            -steps * ITEM,
            { duration: SNAP_MS },
            (done) => {
              if (done && steps !== 0) runOnJS(onStep)(steps);
            },
          );
        }),
    [rowsBefore, rowsAfter, shift, detent, onStep],
  );

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        className={
          align === 'right'
            ? 'flex-1 items-end pr-[22px]'
            : 'flex-1 items-start pl-[22px]'
        }
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 72 - REACH * ITEM,
              height: OFFSETS.length * ITEM,
            },
            sliderStyle,
          ]}
        >
          {rows.map((row, i) => (
            <WheelItem
              key={OFFSETS[i]}
              align={align}
              offset={OFFSETS[i]}
              shift={shift}
              row={row}
              color={color}
            />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function WheelItem({
  align,
  offset,
  shift,
  row,
  color,
}: {
  align: 'left' | 'right';
  offset: number;
  shift: SharedValue<number>;
  row: WheelRow;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: rowOpacity(Math.abs(offset * ITEM + shift.value) / ITEM),
  }));
  return (
    <Animated.View style={style}>
      <Pressable
        onPress={row.onPress ?? undefined}
        disabled={!row.onPress}
        accessibilityRole={row.onPress ? 'button' : undefined}
        accessibilityLabel={row.accessibilityLabel}
        importantForAccessibility={row.onPress ? 'yes' : 'no-hide-descendants'}
        feedback="none"
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
          {row.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
