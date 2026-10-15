import { ChevronDown } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { cn } from '../lib/cn';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export interface DisclosureProps {
  label: string;
  expanded: boolean;
  onPress: () => void;
  className?: string;
}

/** A tint "More" row with a chevron that turns over when it is open (52pt tall). */
export function Disclosure({
  label,
  expanded,
  onPress,
  className,
}: DisclosureProps) {
  const depth = useDepth();
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
      {/* The turn is on a View: a transform on the SVG icon itself drops it on Android. */}
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
      >
        <ChevronDown size={14} strokeWidth={3} color={depth.colors.tint} />
      </View>
    </Pressable>
  );
}
