import { CloudOff } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';

/**
 * Quiet amber banner for a screen that is showing its last saved copy
 * (STATES.md: "Offline · showing what we had at 10:32"). Reading still works
 * offline; anything that changes the schedule is blocked.
 */
export function OfflineBanner({ lastUpdated }: { lastUpdated: string | null }) {
  const { t } = useTranslation();
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
        {lastUpdated
          ? t('states.offline.banner', { time: lastUpdated })
          : t('states.offline.bannerNoTime')}
      </Text>
    </View>
  );
}
