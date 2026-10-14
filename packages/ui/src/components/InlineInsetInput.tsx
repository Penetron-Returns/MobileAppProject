import * as React from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { cn } from '../lib/cn';
import { Surface } from '../primitives/Surface';
import { useDepth } from '../theme/useDepth';

export interface InlineInsetInputProps extends TextInputProps {
  /** Spoken name of the field (the visible label sits beside it in the row). */
  label: string;
  containerClassName?: string;
}

/** The 40pt pressed-in field at the right of a form row (Name, Price), text right-aligned. */
export const InlineInsetInput = React.forwardRef<
  TextInput,
  InlineInsetInputProps
>(function InlineInsetInput({ label, containerClassName, ...props }, ref) {
  const depth = useDepth();
  return (
    <Surface
      variant="inset"
      radius={12}
      className={cn('h-10 justify-center px-3', containerClassName)}
    >
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={depth.colors.secondary}
        style={{ color: depth.colors.label, padding: 0, fontSize: 17 }}
        className="text-right"
        {...props}
      />
    </Surface>
  );
});
