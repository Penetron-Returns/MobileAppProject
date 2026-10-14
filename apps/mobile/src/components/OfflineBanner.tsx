import { CloudOff } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

/** Quiet amber banner shown while a screen is on saved data. */
export function OfflineBanner({ label }: { label: string }) {
  const depth = useDepth();
  return (
    <View
      accessibilityRole="alert"
      style={{ backgroundColor: depth.colors.amberFill }}
      className="mx-5 mt-4 flex-row items-center gap-2 rounded-2xl px-3.5 py-2.5"
    >
      <CloudOff size={18} strokeWidth={1.8} color={depth.colors.amber} />
      <Text
        style={{ color: depth.colors.amber }}
        className="flex-1 text-subtitle font-semibold"
      >
        {label}
      </Text>
    </View>
  );
}
