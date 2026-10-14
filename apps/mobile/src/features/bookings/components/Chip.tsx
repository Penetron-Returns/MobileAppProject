import * as React from 'react';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

/** A selectable pill (time, staff). Selected = tactile tint, otherwise raised. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={selected ? depth.primary : depth.button}
      className="min-h-11 min-w-[76px] items-center justify-center rounded-full px-4"
    >
      <Text
        style={{
          color: selected ? '#FFFFFF' : depth.colors.label,
          fontVariant: ['tabular-nums'],
        }}
        className="text-title font-semibold"
      >
        {label}
      </Text>
    </Pressable>
  );
}
