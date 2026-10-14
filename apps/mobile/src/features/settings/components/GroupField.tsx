import * as React from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { TextInput, View, type TextInputProps } from 'react-native';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { cn } from '@/lib/utils';

interface GroupFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> extends Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'> {
  control: Control<TValues>;
  name: TName;
  label: string;
  showSeparator?: boolean;
}

/** A labelled text row inside a `Group`: small label above a borderless field, error below. */
export function GroupField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  control,
  name,
  label,
  showSeparator,
  editable = true,
  multiline,
  ...inputProps
}: GroupFieldProps<TValues, TName>) {
  const depth = useDepth();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <View className="min-h-14 px-4 py-2">
          {showSeparator ? (
            <Surface
              variant="engrave"
              className="absolute left-4 right-0 top-0 h-0.5"
            />
          ) : null}
          <Text className="text-meta text-muted-foreground">{label}</Text>
          <TextInput
            value={typeof field.value === 'string' ? field.value : ''}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            editable={editable}
            multiline={multiline}
            accessibilityLabel={label}
            aria-invalid={!!error}
            placeholderTextColor={depth.colors.secondary}
            style={{ color: depth.colors.label }}
            className={cn(
              'min-h-9 py-1 text-title',
              multiline && 'min-h-20 align-top',
            )}
            {...inputProps}
          />
          {error?.message ? (
            <Text
              accessibilityRole="alert"
              className="text-subtitle text-destructive"
            >
              {error.message}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}
