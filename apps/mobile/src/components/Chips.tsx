import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { cn } from '@/lib/utils';

export interface ChipOption<V extends string> {
  value: V;
  label: string;
}

/** Single-select filter chips (raised pill; the selected one is the tactile tint). */
export function Chips<V extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: V;
  onChange: (value: V) => void;
  options: readonly ChipOption<V>[];
  /** Accessible name of the whole group. */
  label: string;
}) {
  const depth = useDepth();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerClassName="gap-2 px-5"
      className="mt-3 grow-0"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            className="min-h-11 justify-center"
          >
            <View
              style={[
                selected ? depth.primary : depth.button,
                { borderRadius: 20 },
              ]}
              className="h-10 items-center justify-center px-4"
            >
              <Text
                className={cn(
                  'text-subtitle font-semibold',
                  selected && 'text-primary-foreground',
                )}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
