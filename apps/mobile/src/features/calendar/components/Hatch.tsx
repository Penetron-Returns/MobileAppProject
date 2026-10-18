import { useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Fills a region of the grid that is outside working hours (or blocked) with a
 * flat, translucent tint. It was an SVG stripe pattern, which re-rasterised on
 * every scroll frame on Android; a plain alpha fill costs nothing. The parent
 * clips it to its rounded frame.
 */
export const Hatch = React.memo(function Hatch() {
  const depth = useDepth();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: withAlpha(
            depth.colors.label,
            depth.scheme === 'dark' ? 0.08 : 0.06,
          ),
        },
      ]}
    />
  );
});
