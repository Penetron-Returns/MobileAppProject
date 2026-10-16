import { Pressable, Text, TIMING, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';
import { useIdlePulse } from '@/hooks/useIdlePulse';
import { useMotionActive } from '@/hooks/useMotionActive';

import type { NowLine, NowRow as NowRowData } from '../../aiLogic';

/** The hero Clovie's size (the board draws it at 138). */
const CLOVIE_SIZE = 136;
const HERO_HEIGHT = 212;
const HALO_WIDTH = 320;
const HALO_HEIGHT = 190;
/** One half of the halo's slow breathe. */
const HALO_HALF = { ...TIMING.pageInOut, duration: 5000 } as const;

/** Pause between halo swells (it breathes once, then rests). */
const HALO_REST_MS = 4000;

const haloImage = (isDark: boolean) =>
  `radial-gradient(closest-side, rgba(42,161,214,${isDark ? 0.34 : 0.3}), rgba(42,161,214,0))`;
const contactImage = (isDark: boolean) =>
  `radial-gradient(closest-side, ${isDark ? 'rgba(0,0,0,0.6)' : 'rgba(16,24,40,0.3)'}, rgba(0,0,0,0))`;

/** A soft blue glow behind Clovie that swells and fades slowly; still under reduced motion. */
function Halo({ isDark }: { isDark: boolean }) {
  const calm = useSharedValue(0);
  useIdlePulse(calm, {
    isActive: useMotionActive(),
    half: HALO_HALF,
    restMs: HALO_REST_MS,
  });
  const style = useAnimatedStyle(() => ({
    opacity: 0.72 + 0.28 * calm.value,
    transform: [{ scale: 0.94 + 0.12 * calm.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          top: 0,
          width: HALO_WIDTH,
          height: HALO_HEIGHT,
          experimental_backgroundImage: haloImage(isDark),
        },
        style,
      ]}
    />
  );
}

/** One line of the status copy, from the pure `NowLine`. */
export function useNowLineText() {
  const { t } = useTranslation();
  return (line: NowLine): string => {
    switch (line.kind) {
      case 'working':
      case 'calm':
      case 'quiet':
        return t(`today.ai.now.${line.kind}`);
      case 'with':
      case 'next':
        return line.name
          ? t(`today.ai.now.${line.kind}`, { name: line.name, time: line.time })
          : t(`today.ai.now.${line.kind}Anon`, { time: line.time });
    }
  };
}

/**
 * The hero: a big centred Clovie on a breathing halo with a contact shadow,
 * and one status line with a small dot under him. Tapping Clovie opens the
 * companion. While the sheet is open (`isPaused`) the live canvas is parked
 * so only one Clovie animates.
 */
export function NowRow({
  row,
  isBusy,
  isPaused,
  onOpenClovie,
}: {
  row: NowRowData;
  isBusy: boolean;
  isPaused: boolean;
  onOpenClovie: () => void;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const lineText = useNowLineText();
  const isDark = depth.scheme === 'dark';
  return (
    <View style={{ height: HERO_HEIGHT, alignItems: 'center', marginTop: 2 }}>
      <Halo isDark={isDark} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 146,
          width: 150,
          height: 24,
          experimental_backgroundImage: contactImage(isDark),
        }}
      />
      <Pressable
        onPress={onOpenClovie}
        feedback="none"
        accessibilityRole="button"
        accessibilityLabel={t('today.ai.openClovie')}
        hitSlop={8}
        style={{
          position: 'absolute',
          top: 8,
          width: CLOVIE_SIZE + 4,
          height: CLOVIE_SIZE + 8,
        }}
      >
        <ClovieAnimated
          state={isBusy ? 'working' : 'default'}
          size={CLOVIE_SIZE}
          isPaused={isPaused}
        />
      </Pressable>
      <View
        accessibilityRole="summary"
        accessibilityLiveRegion="polite"
        className="absolute inset-x-5 flex-row items-center justify-center gap-2"
        style={{ top: 170 }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: depth.colors.success,
          }}
        />
        <Text numberOfLines={1} className="text-title font-semibold">
          {lineText(row.primary)}
        </Text>
      </View>
    </View>
  );
}
