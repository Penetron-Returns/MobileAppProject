import * as React from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../lib/haptics';
import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { DURATION, EASING, timingConfig } from '../tokens/motion';

/** Track padding (p-0.5): the indicator sits inside it. */
const TRACK_PAD = 2;

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
 * selected segment raised as a knob that slides to the chosen option.
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
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const slot = useSharedValue(0);
  const position = useSharedValue(selectedIndex);
  const measured = useSharedValue(0);
  const onLayout = (event: LayoutChangeEvent) => {
    slot.value =
      (event.nativeEvent.layout.width - TRACK_PAD * 2) / options.length;
    measured.value = 1;
  };
  React.useEffect(() => {
    position.value = withTiming(
      selectedIndex,
      timingConfig(DURATION.standard, EASING.out),
    );
  }, [selectedIndex, position]);
  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: measured.value,
    width: slot.value,
    transform: [{ translateX: position.value * slot.value }],
  }));
  return (
    <View
      accessibilityRole={isChoice ? 'radiogroup' : 'tablist'}
      accessibilityLabel={label}
      onLayout={onLayout}
      style={[depth.inset, { borderRadius: isChoice ? 20 : 12 }]}
      className={cn(
        'flex-row items-center p-0.5',
        isChoice && 'h-10',
        className,
      )}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          depth.segment,
          {
            position: 'absolute',
            top: TRACK_PAD,
            bottom: TRACK_PAD,
            left: TRACK_PAD,
            borderRadius: isChoice ? 18 : 10,
          },
          indicatorStyle,
        ]}
      />
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
            onPress={() => {
              if (option.value === value) return;
              haptics.selection();
              onChange(option.value);
            }}
            // The 40pt pill reaches the 44pt target through its slop.
            hitSlop={isChoice ? { top: 2, bottom: 2 } : undefined}
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
