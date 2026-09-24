import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  className?: string;
}

/** iOS-style single-select segmented control (Calendar Day/Week/Month, Clients filters). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="tablist"
      className={cn('bg-muted flex-row items-center rounded-lg p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={cn(
              'flex-1 items-center justify-center rounded-md px-3 py-1.5',
              selected && 'bg-background shadow-sm shadow-black/5',
            )}
          >
            <Text
              className={cn(
                'text-sm font-medium',
                selected ? 'text-foreground' : 'text-muted-foreground',
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
