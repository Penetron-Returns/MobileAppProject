import { Minus, Plus } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Pressable } from '../primitives/Pressable';
import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export interface StepperProps {
  /** The current value as text ("1 h 15 min"), shown before the control. */
  valueText: string;
  decrementLabel: string;
  incrementLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disableDecrement?: boolean;
  disableIncrement?: boolean;
}

/**
 * The value and a pressed-in minus/plus control (Duration, Time kept free
 * after): a 104 x 36 pill split by a hairline.
 */
export function Stepper({
  valueText,
  decrementLabel,
  incrementLabel,
  onDecrement,
  onIncrement,
  disableDecrement,
  disableIncrement,
}: StepperProps) {
  const depth = useDepth();
  return (
    <View className="flex-row items-center gap-3">
      <Text
        style={{ fontVariant: ['tabular-nums'] }}
        className="text-title text-muted-foreground"
      >
        {valueText}
      </Text>
      <Surface variant="inset" radius={18} className="h-9 w-[104px] flex-row">
        <Pressable
          onPress={onDecrement}
          disabled={disableDecrement}
          accessibilityRole="button"
          accessibilityLabel={decrementLabel}
          accessibilityState={{ disabled: Boolean(disableDecrement) }}
          hitSlop={{ top: 4, bottom: 4 }}
          className="flex-1 items-center justify-center"
          style={disableDecrement ? { opacity: 0.4 } : undefined}
        >
          <Minus size={18} strokeWidth={2.4} color={depth.colors.label} />
        </Pressable>
        <View
          style={{ backgroundColor: depth.colors.hairline, width: 0.5 }}
          className="my-2"
        />
        <Pressable
          onPress={onIncrement}
          disabled={disableIncrement}
          accessibilityRole="button"
          accessibilityLabel={incrementLabel}
          accessibilityState={{ disabled: Boolean(disableIncrement) }}
          hitSlop={{ top: 4, bottom: 4 }}
          className="flex-1 items-center justify-center"
          style={disableIncrement ? { opacity: 0.4 } : undefined}
        >
          <Plus size={18} strokeWidth={2.4} color={depth.colors.label} />
        </Pressable>
      </Surface>
    </View>
  );
}
