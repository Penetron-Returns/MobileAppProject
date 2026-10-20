import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Pressable } from '../primitives/Pressable';
import { useDepth } from '../theme/useDepth';
import {
  SYSTEM_COLORS,
  SYSTEM_COLOR_KEYS,
  type SystemColorKey,
} from '../tokens/depth';

export interface ColorSwatchesProps {
  /** The picked system colour, or null when the stored colour is not one of them. */
  value: SystemColorKey | null;
  onChange: (key: SystemColorKey) => void;
  /** Spoken name of each colour ("Blue"). */
  labelFor: (key: SystemColorKey) => string;
}

/** The eight system colours as flat 34pt discs, the picked one ticked. */
export function ColorSwatches({
  value,
  onChange,
  labelFor,
}: ColorSwatchesProps) {
  const depth = useDepth();
  return (
    <View className="flex-row justify-between">
      {SYSTEM_COLOR_KEYS.map((key) => {
        const picked = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityLabel={labelFor(key)}
            accessibilityState={{ selected: picked }}
            hitSlop={5}
            style={{
              ...depth.dome,
              backgroundColor: SYSTEM_COLORS[key][depth.scheme],
              borderRadius: 17,
            }}
            className="h-[34px] w-[34px] items-center justify-center"
          >
            <Check
              size={16}
              strokeWidth={3.2}
              color={depth.colors.onFill}
              style={{ opacity: picked ? 1 : 0 }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
