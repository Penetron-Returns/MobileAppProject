import * as React from 'react';

import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export interface TimeFieldProps {
  /** The time as shown ("08:00"). */
  value: string;
  /** Spoken name ("Monday opens at 08:00"). */
  label: string;
  /** True while this field's wheel is open: washed in the tint. */
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

/** A pressed-in time button (34pt tall) that opens the wheel under its row. */
export function TimeField({
  value,
  label,
  active,
  disabled,
  onPress,
}: TimeFieldProps) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: Boolean(active), disabled: !!disabled }}
      hitSlop={{ top: 5, bottom: 5 }}
      style={[
        depth.inset,
        { borderRadius: 9 },
        active && { backgroundColor: depth.tintWash },
      ]}
      className="h-[34px] justify-center px-2.5"
    >
      <Text
        style={{
          color: active ? depth.colors.tint : depth.colors.label,
          fontVariant: ['tabular-nums'],
        }}
        className="text-title"
      >
        {value}
      </Text>
    </Pressable>
  );
}
