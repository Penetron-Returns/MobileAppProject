import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { Surface } from '@/components/Surface';
import { useDepth } from '@/hooks/useDepth';
import { cn } from '@/lib/utils';

interface InsetInputProps extends TextInputProps {
  /** Spoken name of the field (also the placeholder's meaning). */
  label: string;
  containerClassName?: string;
  /** Rendered after the text (a send button, a unit). */
  trailing?: React.ReactNode;
  /** Corner radius of the pressed-in surface. */
  radius?: number;
}

/** A text field pressed into the surface (depth `inset`), 44pt tall at least. */
export const InsetInput = React.forwardRef<TextInput, InsetInputProps>(
  function InsetInput(
    { label, containerClassName, trailing, radius = 12, multiline, ...props },
    ref,
  ) {
    const depth = useDepth();
    return (
      <Surface
        variant="inset"
        radius={radius}
        className={cn(
          'min-h-11 flex-row items-center gap-2 px-3',
          containerClassName,
        )}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={depth.colors.secondary}
          multiline={multiline}
          style={{ color: depth.colors.label }}
          className={cn(
            'min-w-0 flex-1 py-2.5 text-title',
            multiline && 'max-h-28',
          )}
          {...props}
        />
        {trailing}
      </Surface>
    );
  },
);
