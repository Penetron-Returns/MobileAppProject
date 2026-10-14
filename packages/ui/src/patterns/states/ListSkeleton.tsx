import * as React from 'react';
import { View } from 'react-native';

import { Group } from '../../components/Group';
import { Skeleton } from '../../primitives/Skeleton';
import { useDsText } from '../../lib/strings';

/** Placeholder rows inside a raised group while a list loads for the first time. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const t = useDsText();
  return (
    <Group
      className="mt-5 gap-4 p-4"
      accessibilityLabel={t('states.loading')}
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-full" />
          <View className="flex-1 gap-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3.5 w-1/3" />
          </View>
        </View>
      ))}
    </Group>
  );
}
