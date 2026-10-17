import type { LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

/** The board's coloured domed icon tiles: a flat tone disc. */
export const TILES = {
  booked: ['#3AAEE3', '#1078AF'],
  reminded: ['#FFC15A', '#E68A00'],
  ok: ['#52D68B', '#25A257'],
} as const;

export type TileTone = keyof typeof TILES;

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
  // The deeper stop of each pair: white glyphs read best on it.
  const [, fill] = TILES[tone];
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
        backgroundColor: fill,
      }}
    >
      <Icon size={iconSize} strokeWidth={strokeWidth} color="#FFFFFF" />
    </View>
  );
}
