import * as React from 'react';
import { View } from 'react-native';

import { Surface } from '@/components/Surface';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';

/** A labelled switch row, e.g. "Tell Zanele on WhatsApp". */
export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Surface
      variant="raised"
      className="min-h-14 flex-row items-center justify-between gap-3 px-4 py-2"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-title">{label}</Text>
      </View>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        accessibilityLabel={label}
      />
    </Surface>
  );
}
