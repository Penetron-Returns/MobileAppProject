import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useBlinkFrame } from './useBlinkFrame';

/** Pre-rendered mascot frames: open, half, shut. */
const FRAMES = [
  require('@/assets/images/clovie/default-open-288.png'),
  require('@/assets/images/clovie/default-half-288.png'),
  require('@/assets/images/clovie/default-closed-288.png'),
] as const;

/** Where the live body sat in its box: ~92% wide, ~11% low. */
const BODY_SCALE = 0.92;
const BODY_DROP = 0.11;

/** Warms the blink frames so the first blink never waits on a decode. */
function prefetchFrames() {
  try {
    for (const source of FRAMES.slice(1)) {
      const { uri } = Image.resolveAssetSource(source);
      if (uri) void Image.prefetch(uri).catch(() => undefined);
    }
  } catch {
    // Only an optimisation (a test or a bundler without asset URIs).
  }
}

interface ClovieSpriteProps {
  /** Layout size in pt. */
  size: number;
  /** Blinks only while true. */
  isActive: boolean;
  testID?: string;
  /** Fires when the first frame has loaded (a splash can hide behind it). */
  onLoad?: () => void;
}

/**
 * The mascot as one bitmap with a blink: the
 * frames are pre-rendered, so the only
 * work is a source swap every few seconds. Decorative: callers label the screen.
 */
export const ClovieSprite = React.memo(function ClovieSprite({
  size,
  isActive,
  testID = 'clovie-sprite',
  onLoad,
}: ClovieSpriteProps) {
  const frame = useBlinkFrame(isActive);
  React.useEffect(prefetchFrames, []);
  const body = size * BODY_SCALE;
  const imageStyle = {
    width: body,
    height: body,
    marginLeft: (size - body) / 2,
    marginTop: size * BODY_DROP,
  };
  // The open frame is always mounted at full opacity (never gated on onLoad or
  // on the blink state), so the first paint can never be an empty box. The blink
  // frames are mounted too and only toggle opacity: swapping one Image's source
  // makes Android cancel and re-request the bitmap, which flashed an
  // EmptyDrawable (blank) when that raced the tab handover on a cold start.
  return (
    <View style={{ width: size, height: size }}>
      <Image
        testID={testID}
        source={FRAMES[0]}
        onLoad={onLoad}
        resizeMode="contain"
        resizeMethod="resize"
        fadeDuration={0}
        style={imageStyle}
      />
      {([1, 2] as const).map((index) => (
        <Image
          key={index}
          testID={`${testID}-blink-${index}`}
          source={FRAMES[index]}
          resizeMode="contain"
          resizeMethod="resize"
          fadeDuration={0}
          style={[
            StyleSheet.absoluteFill,
            imageStyle,
            { opacity: frame === index ? 1 : 0 },
          ]}
        />
      ))}
    </View>
  );
});
