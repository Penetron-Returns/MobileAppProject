import { useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { COUNT_MS, COUNT_STEPS, countTextAtStep, fitFontSize } from './countUp';
import { EASE_SPRING } from './motion';
import type { StoryCardNumber } from './model';
import { useReveal } from './useReveal';

/** The big number's size, and the width it has: the screen less the 24 pt content margins. */
const FONT_SIZE = 88;
const SIDE_MARGIN = 24;

interface NumberLineProps {
  number: StoryCardNumber;
  accent: string;
  /** Slides in from the right beside Clovie instead of rising. */
  hasPush: boolean;
  /** False once the card is leaving: it keeps its final value. */
  isCurrent: boolean;
}

/**
 * The step the count is on. It runs once per mount, the first time the card
 * is current: later re-renders or isCurrent flips neither restart nor reset
 * it, and once it reaches the last step it stays there. Reduce Motion and a
 * card that was never current sit on the last step.
 */
function useCountStep(isCurrent: boolean, isReduced: boolean) {
  const isRunnable = isCurrent && !isReduced;
  const [step, setStep] = React.useState(isRunnable ? 0 : COUNT_STEPS);
  const hasStarted = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = React.useCallback((next: number) => {
    setStep(next);
    if (next >= COUNT_STEPS) return;
    timer.current = setTimeout(() => advance(next + 1), COUNT_MS / COUNT_STEPS);
  }, []);

  React.useEffect(() => {
    if (!isRunnable || hasStarted.current) return;
    hasStarted.current = true;
    advance(0);
  }, [isRunnable, advance]);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // A strict-mode remount starts the count again rather than freezing it.
      hasStarted.current = false;
    },
    [],
  );
  return isReduced ? COUNT_STEPS : step;
}

/**
 * The big number. It counts up in 16 steps as plain text driven by React
 * state (16 tiny renders in 0.9 s). Screen readers always get the final
 * value; Reduce Motion shows it at once.
 */
export function NumberLine({
  number,
  accent,
  hasPush,
  isCurrent,
}: NumberLineProps) {
  const isReduced = useReduceMotion();
  const { width } = useWindowDimensions();

  const enter = useReveal(
    hasPush ? 250 : 120,
    hasPush ? 850 : 420,
    EASE_SPRING,
    isReduced,
  );
  const step = useCountStep(isCurrent, isReduced);

  const animated = useAnimatedStyle(() => {
    if (hasPush && !isReduced) {
      return {
        opacity: enter.value,
        transform: [
          { translateX: 120 * (1 - enter.value) },
          { scale: 0.55 + 0.45 * enter.value },
        ],
      };
    }
    return {
      opacity: enter.value,
      transform: [{ translateY: isReduced ? 0 : 12 * (1 - enter.value) }],
    };
  });

  const final = countTextAtStep(number, COUNT_STEPS);
  const shown = step >= COUNT_STEPS ? final : countTextAtStep(number, step);
  const fontSize = fitFontSize(final, width - 2 * SIDE_MARGIN, FONT_SIZE);
  return (
    <Animated.View style={[styles.wrap, animated]}>
      <Text
        accessibilityLabel={final}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.number, { color: accent, fontSize }]}
      >
        {shown}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: -8, transformOrigin: '0% 50%' },
  number: {
    lineHeight: 96,
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
