import { useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const DOME_HIGHLIGHT = {
  light: 'rgba(255,255,255,0.65)',
  dark: 'rgba(255,255,255,0.18)',
} as const;

/**
 * The app mark: a 96pt tint tile with a calendar-check glyph (the board's own
 * SVG path), lit from the top like the other depth domes.
 */
export function AppMark() {
  const depth = useDepth();
  const { tint } = depth.colors;
  const isDark = depth.scheme === 'dark';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 96,
        height: 96,
        borderRadius: 24,
        backgroundColor: tint,
        experimental_backgroundImage: [
          `radial-gradient(120% 90% at 50% 0%, ${DOME_HIGHLIGHT[isDark ? 'dark' : 'light']}, rgba(255,255,255,0) 55%)`,
          `linear-gradient(160deg, ${withAlpha(tint, 0.82)}, ${tint} 55%, ${tint})`,
        ].join(', '),
        boxShadow: [
          'inset 0 1px 0 rgba(255,255,255,0.35)',
          'inset 0 -1px 0 rgba(0,0,0,0.12)',
          '0 1px 2px rgba(16,24,40,0.2)',
          `0 10px 30px ${isDark ? 'rgba(0,0,0,0.5)' : withAlpha(tint, 0.35)}`,
        ].join(', '),
      }}
      className="items-center justify-center"
    >
      <Svg viewBox="0 0 24 24" width={52} height={52} fill="none">
        <Path
          d="M6 4.5h12a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7A2.5 2.5 0 0 1 6 4.5z M3.5 9.5h17 M8 2.5v3 M16 2.5v3 M8 14l2.5 2.5L16 12"
          stroke="#FFFFFF"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
