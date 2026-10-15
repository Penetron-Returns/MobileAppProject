import { TIMING, useAppColorScheme, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { Image, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildClovieHtml, type ClovieState } from './clovieHtml';

/** The library draws its canvas 1.5x the box, so the hop has room above. */
const OVERSCAN = 1.5;
/** Measured from a render: the live body is ~92% of the box wide and sits ~11% of it low. */
const STILL_SCALE = 0.92;
const STILL_DROP = 0.11;

interface ClovieAnimatedProps {
  /** `default` is idle (looks around, blinks, hops now and then); `working` hops and laughs. */
  state?: ClovieState;
  /** Layout size in pt. The hop overscan spills outside it, so do not clip the parent. */
  size: number;
}

/**
 * The bot-avatars Clovie, drawn offline in a transparent WebView. The still
 * artwork shows until the page reports its first paint, then cross-fades to
 * the live canvas; if the WebView fails, or the OS asks for reduced motion,
 * only the still stays. Decorative: the caller labels the screen.
 */
export function ClovieAnimated({
  state = 'default',
  size,
}: ClovieAnimatedProps) {
  const reduceMotion = useReduceMotion();
  const { isDark } = useAppColorScheme();
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const html = React.useMemo(() => buildClovieHtml(state, size), [state, size]);
  const live = !reduceMotion && !failed;
  const showLive = live && ready;

  const onMessage = React.useCallback((event: WebViewMessageEvent) => {
    if (event.nativeEvent.data === 'ready') setReady(true);
  }, []);
  const onFail = React.useCallback(() => setFailed(true), []);

  const liveStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showLive ? 1 : 0, TIMING.standard),
  }));
  const stillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(showLive ? 0 : 1, TIMING.standard),
  }));

  const box = size * OVERSCAN;
  const gutter = (box - size) / 2;
  return (
    <View
      testID="clovie-animated"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <Animated.View
        testID="clovie-still-layer"
        style={[{ width: size, height: size }, stillStyle]}
      >
        <Image
          testID="clovie-still"
          source={
            isDark
              ? require('@/assets/images/companion-default-dark.png')
              : require('@/assets/images/companion-default.png')
          }
          style={{
            width: size * STILL_SCALE,
            height: size * STILL_SCALE,
            marginLeft: (size * (1 - STILL_SCALE)) / 2,
            marginTop: size * STILL_DROP,
          }}
          resizeMode="contain"
        />
      </Animated.View>
      {live ? (
        <Animated.View
          testID="clovie-live-layer"
          style={[
            {
              position: 'absolute',
              top: -gutter,
              left: -gutter,
              width: box,
              height: box,
            },
            liveStyle,
          ]}
        >
          <WebView
            testID="clovie-webview"
            source={{ html }}
            originWhitelist={['*']}
            style={{ flex: 1, backgroundColor: 'transparent' }}
            backgroundColor="transparent"
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            setSupportMultipleWindows={false}
            javaScriptEnabled
            onMessage={onMessage}
            onError={onFail}
            onHttpError={onFail}
            onRenderProcessGone={onFail}
            onContentProcessDidTerminate={onFail}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
