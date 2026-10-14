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

const SWATCH_SHADOW =
  'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -1px 0 rgba(0,0,0,0.1), 0 1px 2px rgba(16,24,40,0.2)';

/** The eight system colours as lit 34pt domes, the picked one ticked. */
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
              boxShadow: SWATCH_SHADOW,
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
