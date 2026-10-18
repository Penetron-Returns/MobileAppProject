import { Ground, Text, useDepth, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';

import { ClovieSprite } from '@/features/clovie-character/ClovieSprite';

import { hideNativeSplash } from './splash';
import { useQuoteCycler } from './useQuoteCycler';

const CLOVIE_SIZE = 140;
const RISE = 6;
const FADE_MS = 280;

/** Fade and rise 6pt in: the line cross-fades with its neighbour. */
function riseIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: RISE }] },
    animations: {
      opacity: withTiming(1, { duration: FADE_MS }),
      transform: [{ translateY: withTiming(0, { duration: FADE_MS }) }],
    },
  };
}

const FADE_IN = FadeIn.duration(FADE_MS).reduceMotion(ReduceMotion.System);
const FADE_OUT = FadeOut.duration(FADE_MS).reduceMotion(ReduceMotion.System);

/** How long the native splash may wait for the still before it hides anyway. */
const SPLASH_SAFETY_MS = 1500;
/** The still's body sits this fraction of the box below the box centre (see ClovieAnimated); offsets it so the body is centred. */
const STILL_CENTRE_DROP = 0.07;
const QUOTE_GAP = 24;

interface ClovieLoadingProps {
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
  /** Injected for tests; how long before the splash hides without the still. */
  splashSafetyMs?: number;
}

/**
 * The full-screen loading state while auth, the session and /v1/me resolve.
 * It sits on the app's own ground (light or dark) and hides the native splash,
 * which is just the wordmark, once the Clovie sprite has loaded (or after a
 * safety timeout): the splash fades into this screen, and the sprite (a bitmap
 * that blinks, so no WebView starts during boot) takes over. Quotes use the theme's primary label
 * colour, which clears WCAG AA on both grounds. It shows only while loading
 * is pending: no minimum display time.
 */
export function ClovieLoading({
  random,
  splashSafetyMs = SPLASH_SAFETY_MS,
}: ClovieLoadingProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const quotes = t('loading.quotes', { returnObjects: true }) as string[];
  const index = useQuoteCycler({ count: quotes.length, random });

  React.useEffect(() => {
    const id = setTimeout(hideNativeSplash, splashSafetyMs);
    return () => clearTimeout(id);
  }, [splashSafetyMs]);

  return (
    <Ground
      testID="clovie-loading"
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading.label')}
      accessibilityLiveRegion="none"
      className="flex-1"
    >
      <View className="flex-1 items-center justify-center px-10">
        <View style={{ marginTop: -CLOVIE_SIZE * STILL_CENTRE_DROP * 2 }}>
          <ClovieSprite
            testID="clovie-still"
            size={CLOVIE_SIZE}
            isActive={!reduceMotion}
            onLoad={hideNativeSplash}
          />
        </View>
        {/* Quotes are decorative: hidden from screen readers so they are never re-announced. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-x-10 min-h-11"
          style={{
            top: '50%',
            marginTop: CLOVIE_SIZE / 2 + QUOTE_GAP,
          }}
        >
          <Animated.View
            key={index}
            entering={reduceMotion ? FADE_IN : riseIn}
            exiting={FADE_OUT}
            className="absolute inset-x-0"
          >
            <Text
              testID="clovie-quote"
              numberOfLines={2}
              style={{ color: depth.colors.label }}
              className="text-center text-subtitle"
            >
              {quotes[index]}
            </Text>
          </Animated.View>
        </View>
      </View>
    </Ground>
  );
}
