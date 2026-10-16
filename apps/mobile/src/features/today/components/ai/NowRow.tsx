import { Pressable, Text, useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ClovieAnimated } from '@/features/brand/ClovieAnimated';

import type { NowLine, NowRow as NowRowData } from '../../aiLogic';

/** The hero Clovie's size (the board draws it at 70). */
const CLOVIE_SIZE = 70;
const HALO = 100;
const HALO_HALF_CYCLE_MS = 5000;
const HALO_IMAGE =
  'radial-gradient(closest-side, rgba(42,161,214,0.26), rgba(42,161,214,0))';

/** A small blue halo that swells and fades slowly behind Clovie; still under reduced motion. */
function Halo() {
  const reduceMotion = useReduceMotion();
  const calm = useSharedValue(0);
  React.useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(calm);
      calm.value = 0;
      return;
    }
    const half = {
      duration: HALO_HALF_CYCLE_MS,
      easing: Easing.inOut(Easing.ease),
    };
    calm.value = withRepeat(
      withSequence(withTiming(1, half), withTiming(0, half)),
      -1,
    );
    return () => cancelAnimation(calm);
  }, [reduceMotion, calm]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.7 + 0.3 * calm.value,
    transform: [{ scale: 0.94 + 0.12 * calm.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          position: 'absolute',
          left: -(HALO - CLOVIE_SIZE) / 2,
          top: -(HALO - CLOVIE_SIZE) / 2 - 4,
          width: HALO,
          height: HALO,
          borderRadius: HALO / 2,
          experimental_backgroundImage: HALO_IMAGE,
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
        return t(`today.ai.now.${line.kind}`, {
          name: line.name ?? t('today.unknownClient'),
          time: line.time,
        });
    }
  };
}

/**
 * Clovie, left-aligned, with a status line and a secondary line. The clover is
 * the companion's entry: tapping it opens the companion. While the sheet is
 * open (`isPaused`) the live canvas is parked so only one Clovie animates.
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
  const lineText = useNowLineText();
  return (
    <View className="flex-row items-center gap-3.5 px-5 pt-2">
      <Pressable
        onPress={onOpenClovie}
        feedback="none"
        accessibilityRole="button"
        accessibilityLabel={t('today.ai.openClovie')}
        hitSlop={8}
        style={{ width: CLOVIE_SIZE + 2, height: CLOVIE_SIZE + 6 }}
      >
        <Halo />
        <ClovieAnimated
          state={isBusy ? 'working' : 'default'}
          size={CLOVIE_SIZE}
          isPaused={isPaused}
        />
      </Pressable>
      <View accessibilityRole="summary" className="min-w-0 flex-1">
        <Text className="text-[20px] font-semibold leading-[26px]">
          {lineText(row.primary)}
        </Text>
        {row.secondary ? (
          <Text className="mt-0.5 text-subtitle text-muted-foreground">
            {lineText(row.secondary)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
