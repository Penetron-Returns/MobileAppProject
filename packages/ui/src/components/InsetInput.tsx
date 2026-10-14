import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { cn } from '../lib/cn';
import { Surface } from '../primitives/Surface';
import { useDepth } from '../theme/useDepth';
import { RADII } from '../tokens/radii';

export interface InsetInputProps extends TextInputProps {
  /** Spoken name of the field (also the placeholder's meaning). */
  label: string;
  containerClassName?: string;
  /** Rendered before the text (a search glyph). */
  leading?: React.ReactNode;
  /** Rendered after the text (a send button, a unit, a clear button). */
  trailing?: React.ReactNode;
  /** Corner radius of the pressed-in surface. */
  radius?: number;
}

/** A text field pressed into the surface (depth `inset`), 44pt tall at least. */
export const InsetInput = React.forwardRef<TextInput, InsetInputProps>(
  function InsetInput(
    {
      label,
      containerClassName,
      leading,
      trailing,
      radius = RADII.field,
      multiline,
      ...props
    },
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
        {leading}
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
