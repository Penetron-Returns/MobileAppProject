import { ChevronDown, ChevronRight } from 'lucide-react-native';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { Turn } from './Turn';

export interface DisclosureProps {
  label: string;
  expanded: boolean;
  onPress: () => void;
  /**
   * `inline` is the "More" link with a chevron beside it that turns over;
   * `row` is a full-width 48pt tint row with the chevron at the far edge that
   * turns a quarter (Holidays and special days on the Hours board).
   */
  variant?: 'inline' | 'row';
  className?: string;
}

/** A tint "More" row with a chevron that turns over when it is open (52pt tall). */
export function Disclosure({
  label,
  expanded,
  onPress,
  variant = 'inline',
  className,
}: DisclosureProps) {
  const depth = useDepth();
  if (variant === 'row') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        className={cn('min-h-12 flex-row items-center gap-1.5', className)}
      >
        <Text
          style={{ color: depth.colors.tint }}
          className="flex-1 text-title"
        >
          {label}
        </Text>
        <Turn open={expanded} degrees={90}>
          <ChevronRight size={14} strokeWidth={2.8} color={depth.colors.tint} />
        </Turn>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      className={cn(
        'min-h-[52px] flex-row items-center gap-1.5 self-start px-1',
        className,
      )}
    >
      <Text style={{ color: depth.colors.tint }} className="text-title">
        {label}
      </Text>
      <Turn open={expanded} degrees={180}>
        <ChevronDown size={14} strokeWidth={3} color={depth.colors.tint} />
      </Turn>
    </Pressable>
  );
}
