import * as React from 'react';

import { cn } from '../lib/cn';
import { Surface } from './Surface';

/**
 * The engraved 2px line between rows of a `Group`. Positioned absolutely at
 * the top of the row below it; `inset` is the left offset in points: 16 for
 * plain rows, 50 after a glyph, 72 after an avatar (the boards' text start).
 */
export function Divider({
  inset = 16,
  className,
}: {
  inset?: number;
  className?: string;
}) {
  return (
    <Surface
      variant="engrave"
      importantForAccessibility="no"
      style={{ left: inset }}
      className={cn('absolute right-0 top-0 h-0.5', className)}
    />
  );
}
