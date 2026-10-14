import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { cn } from '@/lib/utils';

/** A tint-coloured text action ("Add a service"), 44pt tall, optional leading glyph. */
export function TintLink({
  label,
  onPress,
  icon: Glyph,
  className,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  className?: string;
}) {
  const depth = useDepth();
  return (
    <Pressable
      onPress={onPress}
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
