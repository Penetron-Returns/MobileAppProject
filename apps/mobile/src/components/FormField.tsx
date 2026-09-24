import * as React from 'react';
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { View } from 'react-native';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface FormFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> extends Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChangeText' | 'onBlur'
> {
  control: Control<TFieldValues>;
  name: TName;
  label?: string;
  hint?: string;
  className?: string;
  /** Render a custom control instead of the default `Input` (e.g. a `Select`). */
  render?: (field: {
    value: TFieldValues[TName];
    onChange: (value: TFieldValues[TName]) => void;
    onBlur: () => void;
  }) => React.ReactNode;
}

/**
 * react-hook-form + zod field: label, control, error message and a hint,
 * wired through `Controller` so it works with any RHF resolver.
 */
export function FormField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  hint,
  className,
  render,
  ...inputProps
}: FormFieldProps<TFieldValues, TName>) {
  const inputId = React.useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({
        field: { onChange, onBlur, value },
        fieldState: { error },
      }) => (
        <View className={cn('gap-1.5', className)}>
          {label ? <Label nativeID={inputId}>{label}</Label> : null}
          {render ? (
            render({ value, onChange, onBlur })
          ) : (
            <Input
              nativeID={inputId}
              value={
                typeof value === 'string' || typeof value === 'number'
                  ? String(value)
                  : ''
              }
              onChangeText={onChange}
              onBlur={onBlur}
              aria-invalid={!!error}
              {...inputProps}
            />
          )}
          {error?.message ? (
            <Text className="text-destructive text-xs">{error.message}</Text>
          ) : hint ? (
            <Text className="text-muted-foreground text-xs">{hint}</Text>
          ) : null}
        </View>
      )}
    />
  );
}
