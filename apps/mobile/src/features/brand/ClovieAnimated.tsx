import { TIMING, useAppColorScheme } from '@booking/ui';
import * as React from 'react';
import { Image, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useIdlePulse } from '@/hooks/useIdlePulse';
import { useMotionActive } from '@/hooks/useMotionActive';

import { buildClovieHtml, type ClovieState } from './clovieHtml';

/**
 * The WebView clips to its own frame whatever the parent does, and the library
 * clips to its canvas. So the avatar is drawn larger inside the page (see
 * clovieHtml) and the WebView is OVERSCAN times the layout size, pulled back
 * with negative offsets: the footprint stays `size`, the hop and squash get
 * headroom (about 45% of `size` above and on each side).
 */
const OVERSCAN = 2;
/** Measured from a render: the live body is ~92% of the box wide and sits ~11% of it low. */
const STILL_SCALE = 0.92;
const STILL_DROP = 0.11;

/** One half of the native breathe: a slow in-out, from a precomputed token (a plain object, worklet-safe). */
const BREATHE = { ...TIMING.pageInOut, duration: 1600 } as const;
/** Pause between breaths: one calm breath every few seconds, not a 60 fps loop. */
const BREATHE_REST_MS = 3500;
/**
 * Idle duty cycle: the live canvas is a WebView drawing every frame, so after
 * LIVE_WINDOW_MS of idle it is dropped for REST_MS (the still keeps breathing
 * natively), then it returns for another window. `working` never rests.
 */
const LIVE_WINDOW_MS = 9000;
const REST_MS = 45000;
/** How far Clovie rises (fraction of its size) and how much it swells at the top of a breath. */
const BREATHE_LIFT = 0.04;
const BREATHE_SWELL = 0.03;
/** Slack after the live layer's fade-in before the still beneath it is removed. */
const HANDOFF_SLACK_MS = 40;

interface ClovieAnimatedProps {
  /** `default` is idle (looks around, blinks, hops now and then); `working` hops and laughs. */
  state?: ClovieState;
  /** Fires when the live canvas has painted its first frame (again after a WebView restart). */
  onReady?: () => void;
  /** Fires when the live canvas starts or stops (the idle duty cycle), so callers can pulse only while it runs. */
  onLiveChange?: (isLive: boolean) => void;
  /** Fires once, when the still artwork has loaded, so a caller can hide a splash behind it. */
  onStillLoad?: () => void;
  /** Layout size in pt. The hop overscan spills outside it, so do not clip the parent. */
  size: number;
  /**
   * Drops the live WebView and shows the still (it keeps breathing natively).
   * For a second Clovie that is hidden or behind a sheet, so only one canvas runs.
   */
  isPaused?: boolean;
}

/**
 * The bot-avatars Clovie, drawn offline in a transparent WebView. The still
 * artwork shows (opacity 1 from the first frame, no fade) until the page
 * reports its first paint. The live layer then fades in OVER the still, and
 * only once it is fully opaque is the still removed, so there is never a
 * frame where both are partly transparent. If the WebView restarts, the still
 * returns until it reports ready again; if it fails to load, or the OS asks
 * for reduced motion, only the still stays. Decorative: the caller labels the screen.
 *
 * Idle motion has two layers. Inside the page the library looks around and
 * blinks (its own reduced-motion check is neutralised, see clovieHtml: the
 * app already honours the OS setting, and the page's copy froze Clovie on a
 * still frame). On top, the whole character breathes natively, so it reads as
 * alive before the canvas paints or if the WebView fails. Reduce motion turns
 * both off.
 */
export function ClovieAnimated({
  state = 'default',
  onReady,
  onStillLoad,
  onLiveChange,
  size,
  isPaused = false,
}: ClovieAnimatedProps) {
  const isMotionActive = useMotionActive();
  const { isDark } = useAppColorScheme();
  const [ready, setReady] = React.useState(false);
  const [liveOpaque, setLiveOpaque] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  /** Bumped to remount the WebView after its process dies. */
  const [webKey, setWebKey] = React.useState(0);
  const html = React.useMemo(() => buildClovieHtml(state, size), [state, size]);
  const [isResting, setIsResting] = React.useState(false);
  const live =
    isMotionActive &&
    !failed &&
    !isPaused &&
    !(isResting && state === 'default');
  const showLive = live && ready;
  React.useEffect(() => onLiveChange?.(live), [live, onLiveChange]);

  // Idle duty cycle (see LIVE_WINDOW_MS): live for a while, rest, repeat.
  React.useEffect(() => {
    if (!isMotionActive || isPaused || failed || state !== 'default') {
      setIsResting(false);
      return;
    }
    const id = setTimeout(
      () => setIsResting((rest) => !rest),
      isResting ? REST_MS : LIVE_WINDOW_MS,
    );
    return () => clearTimeout(id);
  }, [isMotionActive, isPaused, failed, state, isResting]);

  // A resting, parked or hidden canvas is gone: the next start begins from the still.
  React.useEffect(() => {
    if (live) return;
    setReady(false);
    setLiveOpaque(false);
  }, [live]);

  const onMessage = React.useCallback(
    (event: WebViewMessageEvent) => {
      if (event.nativeEvent.data !== 'ready') return;
      setReady(true);
      onReady?.();
    },
    [onReady],
  );
  const onFail = React.useCallback(() => setFailed(true), []);
  const onRestart = React.useCallback(() => {
    setReady(false);
    setLiveOpaque(false);
    setWebKey((k) => k + 1);
  }, []);

  // The still leaves only after the live layer has finished fading in.
  React.useEffect(() => {
    if (!showLive) return;
    const id = setTimeout(
      () => setLiveOpaque(true),
      TIMING.quick.duration + HANDOFF_SLACK_MS,
    );
    return () => clearTimeout(id);
  }, [showLive]);

  const breath = useSharedValue(0);
  // Only while the live window runs: a resting Clovie is a still image and
  // costs zero frames (a native breathe repaints the whole window every vsync).
  useIdlePulse(breath, {
    isActive: live,
    half: BREATHE,
    restMs: BREATHE_REST_MS,
  });
  const breatheStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -size * BREATHE_LIFT * breath.value },
      { scale: 1 + BREATHE_SWELL * breath.value },
    ],
  }));

  // Fade in when ready; snap back to hidden on a restart.
  const liveStyle = useAnimatedStyle(() => ({
    opacity: showLive ? withTiming(1, TIMING.quick) : 0,
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
        testID="clovie-breathe"
        style={[{ width: size, height: size }, breatheStyle]}
      >
        {/* Unmounted (not faded) once the live layer is fully opaque, and mounted
          fresh at full opacity whenever the live layer goes away. An animated
          opacity left at 0 by the fade-out hid the still after the rest. */}
        {liveOpaque ? null : (
          <View
            testID="clovie-still-layer"
            style={{ width: size, height: size }}
          >
            <Image
              testID="clovie-still"
              onLoad={onStillLoad}
              fadeDuration={0}
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
          </View>
        )}
        {live ? (
          <Animated.View
            key={webKey}
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
              onRenderProcessGone={onRestart}
              onContentProcessDidTerminate={onRestart}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}
