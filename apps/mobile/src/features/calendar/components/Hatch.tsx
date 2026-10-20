import { useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { Image as RNImage, Platform, StyleSheet, View } from 'react-native';

// Pre-rendered stripe tiles (see scripts/build-hatch-tiles.mjs). A tiled bitmap
// is one texture the GPU repeats; the SVG pattern it replaced re-rasterised on
// every scroll frame on Android.
export const HATCH_TILES = {
  light: require('../../../../assets/images/hatch/hatch-light.png') as number,
  dark: require('../../../../assets/images/hatch/hatch-dark.png') as number,
};

/**
 * Diagonal stripes over a region of the grid that is outside working hours (or
 * blocked). The parent clips it to its rounded frame.
 */
export const Hatch = React.memo(function Hatch({
  width,
  height,
}: {
  /** The span's own size: Android only tiles a bitmap that has explicit dimensions. */
  width: number;
  height: number;
}) {
  const depth = useDepth();
  const isDark = depth.scheme === 'dark';
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: withAlpha(
              depth.colors.label,
              isDark ? 0.08 : 0.06,
            ),
          },
        ]}
      />
    );
  }
  return (
    <RNImage
      testID="hatch"
      source={isDark ? HATCH_TILES.dark : HATCH_TILES.light}
      resizeMode="repeat"
      style={[IMAGE_STYLE, { width, height }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
});

// pointerEvents lives in the style: Image has no such prop.
const IMAGE_STYLE = {
  position: 'absolute',
  top: 0,
  left: 0,
  pointerEvents: 'none',
} as const;
