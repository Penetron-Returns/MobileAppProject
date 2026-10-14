import * as React from 'react';
import { View, type ViewProps } from 'react-native';

import { type DepthTokens } from '@/lib/depth';
import { useDepth } from '@/hooks/useDepth';

type SurfaceVariant =
  'raised' | 'hero' | 'floating' | 'inset' | 'dome' | 'knob' | 'engrave';

const RADIUS: Record<SurfaceVariant, number | undefined> = {
  raised: 22,
  hero: 26,
  floating: 32,
  inset: 24,
  dome: undefined,
  knob: undefined,
  engrave: undefined,
};

/**
 * A depth-styled container (layered shadow + gradient from `lib/depth.ts`).
 * `className` still handles layout and spacing; `radius` overrides the
 * variant's default corner radius.
 */
export function Surface({
  variant = 'raised',
  radius,
  style,
  ...props
}: ViewProps & { variant?: SurfaceVariant; radius?: number }) {
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
