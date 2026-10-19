import { useReduceMotion } from '@booking/ui';
import * as React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import {
  COUNT_MS,
  countText,
  fitFontSize,
  formatCount,
  countDefaultText,
} from './countUp';
import { EASE_SPRING } from './motion';
import type { StoryCardNumber } from './model';
import { useReveal } from './useReveal';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

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
 * The big number. It counts up in 16 steps on the UI thread: the text is a
 * derived value written straight to a read-only TextInput, so counting never
 * renders React. Screen readers always get the final value. Reduce Motion
 * shows the final value at once, as plain text.
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
  const count = useReveal(0, COUNT_MS, Easing.linear, isReduced);

  const text = useDerivedValue(() => countText(number, count.value));
  const animatedProps = useAnimatedProps(
    () => ({ text: text.value }) as Partial<TextInputProps>,
  );

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

  const final = formatCount(number.value, number.format, number.unit);
  const first = countDefaultText(number, { isCurrent, isReduced });
  const fontSize = fitFontSize(final, width - 2 * SIDE_MARGIN, FONT_SIZE);
  const textStyle = [styles.number, { color: accent, fontSize }];
  return (
    <Animated.View style={[styles.wrap, animated]}>
      {isReduced ? (
        <Text
          accessibilityLabel={final}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={textStyle}
        >
          {final}
        </Text>
      ) : (
        <AnimatedTextInput
          accessibilityLabel={final}
          editable={false}
          pointerEvents="none"
          scrollEnabled={false}
          defaultValue={first}
          animatedProps={animatedProps}
          style={textStyle}
        />
      )}
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
    padding: 0,
    includeFontPadding: false,
  },
});
