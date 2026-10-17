import { Check, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { RADII } from '../tokens/radii';

export interface ChoiceCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  selected: boolean;
  onPress: () => void;
}

/**
 * A single-choice card (radio): raised surface, leading icon, title and
 * subtitle, a 2pt tint border and a tint check when selected. Put several in
 * a `role="radiogroup"` view.
 */
export function ChoiceCard({
  title,
  subtitle,
  icon: IconComponent,
  selected,
  onPress,
}: ChoiceCardProps) {
  const depth = useDepth();
  return (
    <Pressable
      feedback="none"
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [
        depth.raised,
        {
          minHeight: 72,
          borderRadius: RADII.hero,
          borderWidth: 2,
          borderColor: selected ? depth.colors.tint : 'transparent',
          opacity: pressed ? 0.6 : 1,
        },
      ]}
      className="flex-row items-center gap-3.5 px-4 py-3"
    >
      {IconComponent ? (
        <IconComponent
          size={26}
          strokeWidth={1.8}
          color={depth.colors.secondary}
        />
      ) : null}
      <View className="min-w-0 flex-1">
        <Text className="text-title font-semibold">{title}</Text>
        {subtitle ? (
          <Text
            style={{ color: depth.colors.secondary }}
            className="text-subtitle"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <View
          style={[
            depth.dome,
            {
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: depth.colors.tint,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <Check size={16} strokeWidth={3} color={depth.colors.onFill} />
        </View>
      ) : null}
    </Pressable>
  );
}
