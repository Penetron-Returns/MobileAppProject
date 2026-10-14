import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';

import { useDepth } from '../theme/useDepth';
import { Surface } from '../primitives/Surface';
import { cn } from '../lib/cn';

const SIZES = {
  md: { box: 'h-[52px] w-[52px]', radius: 26, glyph: 26 },
  lg: { box: 'h-16 w-16', radius: 32, glyph: 30 },
} as const;

export interface IconDomeProps {
  icon: LucideIcon;
  size?: keyof typeof SIZES;
  className?: string;
}

/** A plain secondary-grey glyph on a depth dome: the state illustration (empty, error, offline). */
export function IconDome({
  icon: Glyph,
  size = 'md',
  className,
}: IconDomeProps) {
  const depth = useDepth();
  const s = SIZES[size];
  return (
    <Surface
      variant="dome"
      radius={s.radius}
      className={cn('items-center justify-center', s.box, className)}
    >
      <Glyph size={s.glyph} strokeWidth={1.8} color={depth.colors.secondary} />
    </Surface>
  );
}
