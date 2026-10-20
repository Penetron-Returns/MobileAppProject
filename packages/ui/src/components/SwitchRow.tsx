import * as React from 'react';
import { View } from 'react-native';

import { Surface } from '../primitives/Surface';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { Switch } from './Switch';

export interface SwitchRowProps {
  title: string;
  detail?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Spoken name of the switch; defaults to the title. */
  switchLabel?: string;
  /** `flat` sits inside a group or form; `card` is its own raised row. */
  variant?: 'flat' | 'card';
  minHeight?: number;
  /** Extra control (for example a price field) that dims with the row. */
  control?: React.ReactNode;
}

/**
 * A list row: title and detail on the left, an optional control and a switch
 * on the right. In the `flat` variant the text and control dim when the switch
 * is off.
 */
export function SwitchRow({
  title,
  detail,
  checked,
  onCheckedChange,
  switchLabel,
  variant = 'flat',
  minHeight = 56,
  control,
}: SwitchRowProps) {
  const depth = useDepth();
  const dim = variant === 'flat' && !checked;
  const row = (
    <>
      <View className="min-w-0 flex-1" style={{ opacity: dim ? 0.4 : 1 }}>
        <Text className="text-title">{title}</Text>
        {detail ? (
          <Text
            style={{ color: depth.colors.secondary }}
            className="text-subtitle"
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {control ? (
        <View style={{ opacity: dim ? 0.4 : 1 }}>{control}</View>
      ) : null}
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        accessibilityLabel={switchLabel ?? title}
      />
    </>
  );
  if (variant === 'card') {
    return (
      <Surface
        variant="raised"
        style={{ minHeight }}
        className="flex-row items-center justify-between gap-3 px-4 py-2"
      >
        {row}
      </Surface>
    );
  }
  return (
    <View style={{ minHeight }} className="flex-row items-center gap-3 py-1.5">
      {row}
    </View>
  );
}
