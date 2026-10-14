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
  className?: string;
}

/** A tint-coloured text action ("Add a service"), 44pt tall, optional leading glyph. */
export function TintLink({
  label,
  onPress,
  icon: Glyph,
  className,
}: TintLinkProps) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
      feedback="none"
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'min-h-11 flex-row items-center gap-1.5 self-start',
        className,
      )}
    >
      {Glyph ? (
        <Glyph size={20} strokeWidth={2.4} color={depth.colors.tint} />
      ) : null}
      <Text style={{ color: depth.colors.tint }} className="text-title">
        {label}
      </Text>
    </Pressable>
  );
}
