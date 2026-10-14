import { Search, X } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { InsetInput } from './InsetInput';
import { useDsText } from '../lib/strings';

export interface SearchFieldProps extends Omit<
  TextInputProps,
  'value' | 'onChangeText'
> {
  value: string;
  onChangeText: (text: string) => void;
  /** Spoken name of the field; defaults to the placeholder, then "Search". */
  label?: string;
  /**
   * How to clear: `icon` puts a small x inside the field, `cancel` shows a
   * tint "Cancel" link beside it (the Clients board).
   */
  clear?: 'icon' | 'cancel';
  containerClassName?: string;
}

/** Search field: an inset field with a leading glyph and a way to clear it once there is text. */
export const SearchField = React.forwardRef<TextInput, SearchFieldProps>(
  function SearchField(
    {
      value,
      onChangeText,
      label,
      placeholder,
      clear = 'icon',
      containerClassName,
      ...props
    },
    ref,
  ) {
    const t = useDsText();
    const depth = useDepth();
    const searchLabel = t('common.search');
    const field = (
      <InsetInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        label={label ?? placeholder ?? searchLabel}
        placeholder={placeholder ?? searchLabel}
        accessibilityRole="search"
        returnKeyType="search"
        containerClassName={clear === 'cancel' ? 'flex-1' : containerClassName}
        leading={
          <Search size={20} strokeWidth={1.8} color={depth.colors.secondary} />
        }
        trailing={
          clear === 'icon' && value ? (
            <Pressable
              onPress={() => onChangeText('')}
              accessibilityRole="button"
              accessibilityLabel={t('common.clearSearch')}
              hitSlop={12}
            >
              <X size={16} strokeWidth={2.4} color={depth.colors.secondary} />
            </Pressable>
          ) : null
        }
        {...props}
      />
    );
    if (clear === 'icon') return field;
    const cancel = t('common.cancel');
    return (
      <View className={cn('flex-row items-center gap-3', containerClassName)}>
        {field}
        {value ? (
          <Pressable
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel={cancel}
            className="min-h-11 justify-center active:opacity-50"
          >
            <Text style={{ color: depth.colors.tint }} className="text-title">
              {cancel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
);
