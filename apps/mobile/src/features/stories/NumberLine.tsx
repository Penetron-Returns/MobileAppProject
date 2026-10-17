import { useReduceMotion } from '@booking/ui';
import * as React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';

import {
  COUNT_MS,
  COUNT_STEPS,
  countStep,
  formatCount,
  valueAtStep,
} from './countUp';
import { EASE_SPRING } from './motion';
import type { StoryCardNumber } from './model';
import { useReveal } from './useReveal';

interface NumberLineProps {
  number: StoryCardNumber;
  accent: string;
  /** Slides in from the right beside Clovie instead of rising. */
  hasPush: boolean;
}

/**
 * The big number. It counts up in 16 steps: the progress runs on the UI thread
 * and only the 16 step changes reach JS to re-render the text. Screen readers
 * always get the final value. Reduce Motion shows the final value at once.
 */
export function NumberLine({ number, accent, hasPush }: NumberLineProps) {
  const isReduced = useReduceMotion();
  const [step, setStep] = React.useState(isReduced ? COUNT_STEPS : 0);

  const enter = useReveal(
    hasPush ? 250 : 120,
    hasPush ? 850 : 420,
    EASE_SPRING,
    isReduced,
  );
  const count = useReveal(0, COUNT_MS, Easing.linear, isReduced);
  useAnimatedReaction(
    () => countStep(count.value),
    (s, prev) => {
      if (s !== prev) runOnJS(setStep)(s);
    },
  );
  React.useEffect(() => {
    if (isReduced) setStep(COUNT_STEPS);
  }, [isReduced]);

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

  const shown = formatCount(
    valueAtStep(number.value, step),
    number.format,
    number.unit,
  );
  const final = formatCount(number.value, number.format, number.unit);
  return (
    <Animated.View style={[styles.wrap, animated]}>
      <Text
        accessibilityLabel={final}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.number, { color: accent }]}
      >
        {shown}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: -8, transformOrigin: '0% 50%' },
  number: {
    fontSize: 88,
    lineHeight: 96,
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
});
