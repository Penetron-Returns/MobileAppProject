import * as React from 'react';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { withAlpha } from '@/lib/depth';
import { useDepth } from '@/hooks/useDepth';

/** Diagonal stripes over a region of the grid that is outside working hours. */
export function Hatch({ width, height }: { width: number; height: number }) {
  const depth = useDepth();
  const stroke = withAlpha(
    depth.colors.label,
    depth.scheme === 'dark' ? 0.1 : 0.07,
  );
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <Pattern
          id="off-hours"
          width={8}
          height={8}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Line x1={0} y1={0} x2={0} y2={8} stroke={stroke} strokeWidth={2} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#off-hours)" />
    </Svg>
  );
}
