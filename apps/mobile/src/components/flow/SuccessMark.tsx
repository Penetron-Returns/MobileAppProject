import { Check } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

/** The large green completion dome (design: 88pt on the done screen). */
export function SuccessMark({ size = 88 }: { size?: number }) {
  const depth = useDepth();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        depth.dome,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: depth.scheme === 'dark' ? '#30D158' : '#34C759',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.35), 0 1px 2px rgba(16,24,40,0.2), 0 10px 24px -6px rgba(36,138,61,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      <Check size={size * 0.59} strokeWidth={2.6} color="#FFFFFF" />
    </View>
  );
}

/** A green check followed by a line of text (feature or status list item). */
export function CheckPoint({ text }: { text: string }) {
  const depth = useDepth();
  return (
    <View className="flex-row items-start gap-2.5">
      <Check size={20} strokeWidth={2.6} color={depth.colors.green} />
      <Text className="text-subtitle flex-1">{text}</Text>
    </View>
  );
}
