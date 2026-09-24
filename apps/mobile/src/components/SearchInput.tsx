import { Search, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

interface SearchInputProps extends Omit<
  React.ComponentProps<typeof TextInput>,
  'className'
> {
  value: string;
  onChangeText: (text: string) => void;
  containerClassName?: string;
}

/** Search field with a leading icon and a clear button, used by list screens. */
export const SearchInput = React.forwardRef<TextInput, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChangeText,
      containerClassName,
      placeholder = 'Search',
      ...props
    },
    ref,
  ) {
    return (
      <View
        className={cn(
          'border-input bg-card flex-row items-center gap-2 rounded-lg border px-3',
          containerClassName,
        )}
      >
        <Icon as={Search} size={18} className="text-muted-foreground" />
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          accessibilityRole="search"
          returnKeyType="search"
          className="text-foreground placeholder:text-muted-foreground/50 h-11 flex-1 text-base"
          {...props}
        />
        {value ? (
          <Pressable
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <Icon as={X} size={16} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
    );
  },
);
