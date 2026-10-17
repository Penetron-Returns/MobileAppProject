import * as React from 'react';
import { View } from 'react-native';

import { cn } from '../lib/cn';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';

export type CapsuleTone = 'neutral' | 'amber' | 'green' | 'grey';

export interface CapsuleProps {
  label: string;
  tone?: CapsuleTone;
  className?: string;
}

/**
 * Small pill label. Status capsules are for exceptions only (SOFT.md): the
 * quiet `neutral` kind ("VIP", "Regular"), `amber` for needs-attention,
 * `green` for checked in, `grey` for cancelled.
 */
export function Capsule({ label, tone = 'neutral', className }: CapsuleProps) {
  const depth = useDepth();
  const { fill, text } = depth.capsule[tone];
  return (
    <View
      style={{
        backgroundColor: fill,
      }}
      className={cn('rounded-xl px-2.5 py-[3px]', className)}
    >
      <Text
        style={text ? { color: text } : undefined}
        className={cn(
          'text-meta font-semibold',
          !text && 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </View>
  );
}
