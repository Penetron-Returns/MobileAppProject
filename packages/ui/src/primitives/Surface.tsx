import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { useDepth } from '../theme/useDepth';
import { RADII } from '../tokens/radii';

export type SurfaceVariant =
  | 'raised'
  | 'hero'
  | 'floating'
  | 'inset'
  | 'dome'
  | 'domeRing'
  | 'domeTint'
  | 'knob'
  | 'engrave'
  | 'wheel'
  | 'wheelSelection'
  | 'wheelTop'
  | 'wheelBottom';

const RADIUS: Record<SurfaceVariant, number | undefined> = {
  raised: RADII.raised,
  hero: RADII.hero,
  floating: RADII.floating,
  inset: RADII.inset,
  dome: undefined,
  domeRing: undefined,
  domeTint: undefined,
  knob: undefined,
  engrave: undefined,
  wheel: undefined,
  wheelSelection: undefined,
  wheelTop: undefined,
  wheelBottom: undefined,
};

export interface SurfaceProps extends ViewProps {
  variant?: SurfaceVariant;
  /** Overrides the variant's default corner radius. */
  radius?: number;
}

/**
 * A depth-styled container (layered shadow + gradient from `tokens/depth.ts`).
 * `className` still handles layout and spacing.
 */
export function Surface({
  variant = 'raised',
  radius,
  style,
  ...props
}: SurfaceProps) {
  const depth = useDepth();
  const cornerRadius = radius ?? RADIUS[variant];
  return (
    <View
      style={[
        depth[variant],
        cornerRadius != null && { borderRadius: cornerRadius },
        style,
      ]}
      {...props}
    />
  );
}
