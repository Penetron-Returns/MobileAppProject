import {
  Text,
  useDepth,
  useAppColorScheme,
  useReduceMotion,
} from '@booking/ui';
import { LinearGradient } from 'expo-linear-gradient';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  withTiming,
} from 'react-native-reanimated';

import { ClovieAnimated } from './ClovieAnimated';
import { hideNativeSplash } from './splash';
import { useQuoteCycler } from './useQuoteCycler';

const GRADIENT = {
  light: ['#E3F3FB', '#FFFFFF'],
  dark: ['#0B1A22', '#051218'],
} as const;
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
/** The still's body sits this fraction of the box below the box centre (see ClovieAnimated). */
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
 * It hides the native splash once the still Clovie has loaded (or after a
 * safety timeout), so splash, still and animated Clovie hand off with no empty
 * frame. Clovie's body sits at the screen centre, like the splash icon, whose
 * width is set in app.json to match. It shows only while loading is pending:
 * no minimum display time.
 */
export function ClovieLoading({
  random,
  splashSafetyMs = SPLASH_SAFETY_MS,
}: ClovieLoadingProps) {
  const { t } = useTranslation();
  const { isDark } = useAppColorScheme();
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const quotes = t('loading.quotes', { returnObjects: true }) as string[];
  const index = useQuoteCycler({ count: quotes.length, random });
  const stops = GRADIENT[isDark ? 'dark' : 'light'];

  React.useEffect(() => {
    const id = setTimeout(hideNativeSplash, splashSafetyMs);
    return () => clearTimeout(id);
  }, [splashSafetyMs]);

  return (
    <View
      testID="clovie-loading"
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading.label')}
      accessibilityLiveRegion="none"
      className="flex-1"
    >
      <LinearGradient
        colors={[stops[0], stops[1]]}
        className="absolute inset-0"
      />
      <View className="flex-1 items-center justify-center px-10">
        <View style={{ marginTop: -CLOVIE_SIZE * STILL_CENTRE_DROP * 2 }}>
          <ClovieAnimated
            state="working"
            size={CLOVIE_SIZE}
            onStillLoad={hideNativeSplash}
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
              style={{ color: depth.colors.secondary }}
              className="text-center text-subtitle"
            >
              {quotes[index]}
            </Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
