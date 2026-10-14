import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Pressable } from '../primitives/Pressable';
import { useDepth } from '../theme/useDepth';

const SIZES = {
  /** 44pt: the default tap target. */
  md: { box: 'h-11 w-11', radius: 22, glyph: 22 },
  /** 38pt visible circle with a hit slop that still reaches 44pt. */
  sm: { box: 'h-[38px] w-[38px]', radius: 19, glyph: 20 },
} as const;

export interface IconButtonProps {
  icon: LucideIcon;
  /** Spoken name of the action. Required: an icon has no visible text. */
  label: string;
  onPress: () => void;
  /** `knob` is the raised circle, `plain` has no chrome until pressed. */
  variant?: 'knob' | 'plain';
  size?: keyof typeof SIZES;
  /** Glyph colour: the tint (default for `knob`) or the label colour (default for `plain`). */
  tone?: 'tint' | 'label';
  disabled?: boolean;
  className?: string;
}

/** A round icon-only button, at least 44pt to touch. */
export function IconButton({
  icon: Glyph,
  label,
  onPress,
  variant = 'knob',
  size = 'md',
  tone,
  disabled,
  className,
}: IconButtonProps) {
  const depth = useDepth();
  const s = SIZES[size];
  const glyphColor =
    (tone ?? (variant === 'knob' ? 'tint' : 'label')) === 'tint'
      ? depth.colors.tint
      : depth.colors.label;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={size === 'sm' ? 6 : 0}
      feedback={variant === 'knob' ? 'inset' : 'dim'}
      style={
        variant === 'knob'
          ? [depth.knob, { borderRadius: s.radius }]
          : undefined
      }
      className={cn(
        'items-center justify-center',
        s.box,
        disabled && 'opacity-50',
        className,
      )}
    >
      <Glyph
        size={s.glyph}
        strokeWidth={variant === 'knob' ? 2.4 : 2}
        color={glyphColor}
      />
    </Pressable>
  );
}
