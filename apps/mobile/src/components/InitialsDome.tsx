import * as React from 'react';

import { Surface } from '@/components/Surface';
import { Text } from '@/components/ui/text';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const SIZES = {
  md: { box: 'h-11 w-11', radius: 22, text: 'text-subtitle' },
  xl: { box: 'h-20 w-20', radius: 40, text: 'text-section' },
} as const;

/** Initials on a depth "dome": the design's avatar. Decorative, so hidden from screen readers. */
export function InitialsDome({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <Surface
      variant="dome"
      radius={s.radius}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('items-center justify-center', s.box, className)}
    >
      <Text className={cn('font-semibold text-muted-foreground', s.text)}>
        {initials(name)}
      </Text>
    </Surface>
  );
}
