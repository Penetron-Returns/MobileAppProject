import * as React from 'react';
import { View } from 'react-native';

import { cn } from '../lib/cn';
import { useDepth } from '../theme/useDepth';
import { Surface } from './Surface';

/**
 * The engraved 2px line between rows of a `Group`: a 1px shadow line over a
 * 1px highlight line. Positioned absolutely at the top of the row below it;
 * `inset` is the left offset in points: 16 for plain rows, 50 after a glyph,
 * 72 after an avatar (the boards' text start).
 */
export function Divider({
  inset = 16,
  className,
}: {
  inset?: number;
  className?: string;
}) {
  const depth = useDepth();
  return (
    <Surface
      variant="engrave"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ left: inset, height: 2 }}
      className={cn('absolute right-0 top-0', className)}
    >
      <View style={{ height: 1, backgroundColor: depth.engraveLine }} />
      <View style={{ height: 1, backgroundColor: depth.engraveLight }} />
    </Surface>
  );
}
