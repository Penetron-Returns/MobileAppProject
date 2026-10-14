import * as React from 'react';

import { cn } from '../lib/cn';
import { Surface } from './Surface';

/**
 * The engraved 2px line between rows of a `Group`. Positioned absolutely at
 * the top of the row below it; `inset` is the left offset in points (16 for
 * plain rows, 52 after a glyph, 68 after an avatar).
 */
export function Divider({
  inset = 16,
  className,
}: {
  inset?: 16 | 52 | 68;
  className?: string;
}) {
  return (
    <Surface
      variant="engrave"
      importantForAccessibility="no"
      className={cn(
        'absolute right-0 top-0 h-0.5',
        inset === 16 && 'left-4',
        inset === 52 && 'left-[52px]',
        inset === 68 && 'left-[68px]',
        className,
      )}
    />
  );
}
