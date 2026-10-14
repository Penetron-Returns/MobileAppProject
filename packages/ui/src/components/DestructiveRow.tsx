import * as React from 'react';

import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export interface DestructiveRowProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * The last row of a card: a centred red action ("Remove from team", "Delete
 * service"), 56pt tall. Put it in a `GroupBlock showSeparator`.
 */
export function DestructiveRow({
  label,
  onPress,
  disabled,
}: DestructiveRowProps) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className="min-h-14 items-center justify-center px-4 py-2"
    >
      <Text
        style={{ color: depth.colors.destructiveText }}
        className="text-title leading-7"
      >
        {label}
      </Text>
    </Pressable>
  );
}
