import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { StoryKind } from './model';
import { KIND_GLYPHS } from './tones';

interface KindTileProps {
  kind: StoryKind;
  /** Tile diameter in pt. */
  size: number;
  isDark: boolean;
}

/** The round tile inside a story bubble: a line glyph per kind. */
export function KindTile({ kind, size, isDark }: KindTileProps) {
  const g = KIND_GLYPHS[kind];
  const palette = isDark ? g.dark : g.light;
  const glyph = Math.round(size * 0.5);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <LinearGradient colors={palette.tile} style={StyleSheet.absoluteFill} />
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <Path d={g.shape} fill={palette.ink} fillOpacity={0.2} />
        <Path
          d={g.line}
          fill="none"
          stroke={palette.ink}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={g.shape}
          fill="none"
          stroke={palette.ink}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
