import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

/** The board's coloured domed icon tiles: a top-lit gradient disc with a soft drop shadow. */
export const TILES = {
  booked: ['#3AAEE3', '#1078AF'],
  reminded: ['#FFC15A', '#E68A00'],
  ok: ['#52D68B', '#25A257'],
} as const;

export type TileTone = keyof typeof TILES;

const SHEEN =
  'radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.5), rgba(255,255,255,0) 60%)';
const TILE_SHADOW =
  '0 1px 2px rgba(16,24,40,0.25), 0 4px 10px -3px rgba(16,24,40,0.3), inset 0 1px 0 rgba(255,255,255,0.45)';

/** Decorative: the row or card beside it carries the meaning. */
export function Tile({
  tone,
  icon: Icon,
  size = 40,
  iconSize = 21,
  strokeWidth = 2,
}: {
  tone: TileTone;
  icon: LucideIcon;
  size?: number;
  iconSize?: number;
  strokeWidth?: number;
}) {
  const [top, bottom] = TILES[tone];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: top,
        experimental_backgroundImage: `${SHEEN}, linear-gradient(180deg, ${top}, ${bottom})`,
        boxShadow: TILE_SHADOW,
      }}
    >
      <Icon size={iconSize} strokeWidth={strokeWidth} color="#FFFFFF" />
    </View>
  );
}
