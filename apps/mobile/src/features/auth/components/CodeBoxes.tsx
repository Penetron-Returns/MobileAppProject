import { SPRING, Text, useDepth, withAlpha } from '@booking/ui';
import * as React from 'react';
import { TextInput, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useMotionActive } from '@/hooks/useMotionActive';

import { codeCells, isCodeComplete } from '../logic';

/** The board's box: 48 by 56, 8pt apart, centred. */
const BOX_W = 48;
const BOX_H = 56;
const CARET_MS = 500;

/** One box. The digit pops in (scale .4 to 1, spring) when it lands; the active box keeps a blinking caret. */
function Box({
  digit,
  isActive,
  isDone,
}: {
  digit: string;
  isActive: boolean;
  isDone: boolean;
}) {
  const depth = useDepth();
  const isMotion = useMotionActive();
  const pop = useSharedValue(1);
  const blink = useSharedValue(1);

  React.useEffect(() => {
    if (!digit) return;
    pop.value = 0.4;
    pop.value = withSpring(1, SPRING.bouncy);
  }, [digit, pop]);

  React.useEffect(() => {
    if (!isActive || !isMotion) {
      cancelAnimation(blink);
      blink.value = 1;
      return;
    }
    blink.value = withRepeat(
      withSequence(
        withTiming(0, { duration: CARET_MS }),
        withTiming(1, { duration: CARET_MS }),
      ),
      -1,
    );
    return () => cancelAnimation(blink);
  }, [isActive, isMotion, blink]);

  const digitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  const ring = isActive
    ? { borderWidth: 2, borderColor: depth.colors.tint }
    : { borderWidth: 0.5, borderColor: depth.colors.hairline };
  return (
    <View
      testID="code-box"
      style={[
        {
          width: BOX_W,
          height: BOX_H,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDone
            ? withAlpha(depth.colors.success, 0.18)
            : (depth.raised.backgroundColor as string),
        },
        ring,
      ]}
    >
      {digit ? (
        <Animated.View style={digitStyle}>
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-[24px] font-semibold leading-[30px]"
          >
            {digit}
          </Text>
        </Animated.View>
      ) : isActive ? (
        <Animated.View
          style={[
            {
              width: 2,
              height: 26,
              borderRadius: 1,
              backgroundColor: depth.colors.tint,
            },
            caretStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

/**
 * The six-digit code input: six boxes over one hidden text field, so typing,
 * paste and SMS or email autofill all arrive as plain text. The parent owns the
 * digits and decides when the sixth one submits.
 */
export function CodeBoxes({
  value,
  onChangeText,
  editable,
  label,
}: {
  value: string;
  onChangeText: (raw: string) => void;
  editable: boolean;
  label: string;
}) {
  const cells = codeCells(value);
  const active = Math.min(value.length, cells.length - 1);
  const isDone = isCodeComplete(value);

  return (
    <View accessible={false} style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {cells.map((digit, i) => (
          <Box
            key={i}
            digit={digit}
            isActive={i === active && editable && !isDone}
            isDone={isDone}
          />
        ))}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          autoFocus
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={12}
          accessibilityLabel={label}
          caretHidden
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            opacity: 0.02,
            color: 'transparent',
          }}
        />
      </View>
    </View>
  );
}
