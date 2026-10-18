import * as React from 'react';
import { Image, View } from 'react-native';

import { useBlinkFrame } from './useBlinkFrame';

/** Pre-rendered frames of the real companion (scripts/clovie/render-sprites.mjs), open, half, shut. */
const FRAMES = [
  require('@/assets/images/clovie/default-open-288.png'),
  require('@/assets/images/clovie/default-half-288.png'),
  require('@/assets/images/clovie/default-closed-288.png'),
] as const;

/** Where the live body sat in its box (see ClovieAnimated): ~92% wide, ~11% low. */
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
  /** Layout size in pt, the same box ClovieAnimated fills. */
  size: number;
  /** Blinks only while true. */
  isActive: boolean;
  testID?: string;
  /** Fires when the first frame has loaded (a splash can hide behind it). */
  onLoad?: () => void;
}

/**
 * The companion as one bitmap with a blink, in place of a live WebView: the
 * frames are renders of the same avatar, so it looks the same, and the only
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
  return (
    <View style={{ width: size, height: size }}>
      <Image
        testID={testID}
        source={FRAMES[frame]}
        onLoad={onLoad}
        resizeMode="contain"
        resizeMethod="resize"
        fadeDuration={0}
        style={{
          width: body,
          height: body,
          marginLeft: (size - body) / 2,
          marginTop: size * BODY_DROP,
        }}
      />
    </View>
  );
});
