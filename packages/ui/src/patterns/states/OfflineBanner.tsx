import { CloudOff } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

import { Text } from '../../primitives/Text';
import { useDepth } from '../../theme/useDepth';

export interface OfflineBannerProps {
  /** What the screen is showing, e.g. "Offline · showing what we had at 10:32". */
  label: string;
}

/**
 * Quiet amber banner for a screen showing its last saved copy. Reading still
 * works offline; anything that changes the schedule is blocked.
 */
export function OfflineBanner({ label }: OfflineBannerProps) {
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
