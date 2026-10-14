import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useDepth } from '@/hooks/useDepth';
import { cn } from '@/lib/utils';

/** Small pill label: the quiet "VIP" / "Regular" kind, or an amber warning. */
export function Capsule({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: 'neutral' | 'amber';
  className?: string;
}) {
  const depth = useDepth();
  return (
    <View
      style={{
        backgroundColor:
          tone === 'amber' ? depth.colors.amberFill : 'rgba(118,118,128,0.14)',
        boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.06)',
      }}
      className={cn('rounded-xl px-2.5 py-[3px]', className)}
    >
      <Text
        style={tone === 'amber' ? { color: depth.colors.amber } : undefined}
        className={cn(
          'text-meta font-semibold',
          tone === 'neutral' && 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </View>
  );
}
