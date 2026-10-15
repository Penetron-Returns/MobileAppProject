import * as React from 'react';
import Svg, { Path } from 'react-native-svg';

/** Props every row glyph takes (a `lucide-react-native` icon fits too). */
export interface GlyphProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export type GlyphComponent = React.ComponentType<GlyphProps>;

function makeGlyph(name: string, d: string): GlyphComponent {
  function Glyph({ size = 20, strokeWidth = 1.8, color }: GlyphProps) {
    return (
      <Svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  Glyph.displayName = `Glyph(${name})`;
  return Glyph;
}

/**
 * The settings rows' own line glyphs, drawn from the board's SVG paths
 * (Settings.dc.html) so they match it stroke for stroke.
 */
export const GLYPHS = {
  card: makeGlyph(
    'card',
    'M5.5 5.5h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z M3.5 10h17',
  ),
  store: makeGlyph('store', 'M4 20V9.5L12 4l8 5.5V20 M9.5 20v-6h5v6'),
  clock: makeGlyph(
    'clock',
    'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M12 8v4.5l3 2',
  ),
  scissors: makeGlyph(
    'scissors',
    'M6.5 8.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z M6.5 20.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5z M8.3 7.3L20 17 M8.3 16.7L20 7',
  ),
  team: makeGlyph(
    'team',
    'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5z M16 4.4a3.5 3.5 0 0 1 0 6.2 M18.2 14.9c1.9.7 3.3 2.3 3.3 5.1',
  ),
  sliders: makeGlyph(
    'sliders',
    'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.5v5 M9 14.5v5',
  ),
  chat: makeGlyph(
    'chat',
    'M5 4.5h14a2.5 2.5 0 0 1 2.5 2.5v8.5a2.5 2.5 0 0 1-2.5 2.5h-6.5L8 21.5v-3.5H5A2.5 2.5 0 0 1 2.5 15.5V7A2.5 2.5 0 0 1 5 4.5z',
  ),
  bell: makeGlyph('bell', 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z M10 21h4'),
  help: makeGlyph(
    'help',
    'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1.1.9-1.1 1.8 M12 16.6v.1',
  ),
} as const;
