import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export interface TintLinkProps {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  /** `action` is the bold 52pt "Add a service" row; `plain` a quiet 44pt link. */
  variant?: 'plain' | 'action';
  /** Set when the link opens or closes something below it (the invite card). */
  expanded?: boolean;
  className?: string;
}

/** A tint-coloured text action ("Add a service"), 44pt tall, optional leading glyph. */
export function TintLink({
  label,
  onPress,
  icon: Glyph,
  variant = 'plain',
  expanded,
  className,
}: TintLinkProps) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      feedback="none"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      className={cn(
        'flex-row items-center gap-1.5 self-start',
        variant === 'action' ? 'min-h-[52px]' : 'min-h-11',
        className,
      )}
    >
      {Glyph ? (
        <Glyph size={20} strokeWidth={2.4} color={depth.colors.tint} />
      ) : null}
      <Text
        style={{ color: depth.colors.tint }}
        className={cn('text-title', variant === 'action' && 'font-semibold')}
      >
        {label}
      </Text>
    </Pressable>
  );
}
