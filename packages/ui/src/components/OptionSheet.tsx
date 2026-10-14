import { Check } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from './Sheet';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { cn } from '../lib/cn';

export interface SheetOption<V extends string> {
  value: V;
  label: string;
  description?: string;
}

/** Bottom sheet with a single-choice list. */
export function OptionSheet<V extends string>({
  open,
  onOpenChange,
  title,
  options,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: SheetOption<V>[];
  selected: V | null;
  onSelect: (value: V) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <ScrollView className="max-h-96">
          {options.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  onSelect(option.value);
                  onOpenChange(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={cn(
                  'min-h-[44px] flex-row items-center justify-between rounded-lg p-3.5 active:bg-accent',
                  isSelected && 'bg-primary/5',
                )}
              >
                <View className="flex-1 pr-2">
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      isSelected ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text className="text-muted-foreground text-xs">
                      {option.description}
                    </Text>
                  ) : null}
                </View>
                {isSelected ? (
                  <Icon as={Check} size={18} className="text-primary" />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </SheetContent>
    </Sheet>
  );
}
