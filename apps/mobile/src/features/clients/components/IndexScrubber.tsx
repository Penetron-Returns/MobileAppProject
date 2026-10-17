import { Surface, Text, haptics, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PanResponder, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { LETTERS, letterIndexAt } from '../phoneBook';

/** Board metrics: a 28pt column, 18pt per letter, 486pt tall. */
export const SCRUBBER_WIDTH = 28;
export const SCRUBBER_HEIGHT = 486;
export const SCRUBBER_RIGHT = 2;
const LETTER_HEIGHT = 18;
const DIMMED_OPACITY = 0.35;
/** The magnifier bubble: 44pt, 12pt clear of the strip. */
const BUBBLE_SIZE = 44;
const BUBBLE_GAP = 12;
/** Active letter scale and how far the fisheye reaches (in letters). */
const ACTIVE_SCALE = 1.3;
const FISHEYE_REACH = 2.5;
const SPRING = { damping: 16, stiffness: 320, mass: 0.6 } as const;

interface IndexScrubberProps {
  /** Letters that have at least one client. */
  present: ReadonlySet<string>;
  /** `animated` is false while dragging so fast drags never queue scrolls. */
  onJump: (letter: string, animated: boolean) => void;
  top: number;
}

/**
 * The A-Z strip on the right edge. A tap or a drag along it jumps to that
 * letter, shows a magnifier bubble beside the finger and swells the letters
 * near it; letters with no clients are dimmed. Screen readers get one button
 * per letter. Nothing animates at rest.
 */
export function IndexScrubber({ present, onJump, top }: IndexScrubberProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const reduced = useReducedMotion();
  const strip = React.useRef<View>(null);
  const stripTop = React.useRef(0);
  const lastIndex = React.useRef(-1);
  const onJumpRef = React.useRef(onJump);
  onJumpRef.current = onJump;
  const [bubbleLetter, setBubbleLetter] = React.useState(LETTERS[0]);

  // 0 at rest, 1 while a finger is down.
  const engaged = useSharedValue(0);
  const activeIndex = useSharedValue(-1);
  const fingerY = useSharedValue(0);

  const settle = React.useCallback(
    (to: number) => {
      engaged.value = reduced
        ? withTiming(to, { duration: 120 })
        : withSpring(to, SPRING);
    },
    [engaged, reduced],
  );

  const jumpAt = React.useCallback(
    (y: number, animated: boolean) => {
      const index = letterIndexAt(y, SCRUBBER_HEIGHT);
      fingerY.value = Math.min(Math.max(y, 0), SCRUBBER_HEIGHT);
      if (index === lastIndex.current) return;
      lastIndex.current = index;
      activeIndex.value = index;
      setBubbleLetter(LETTERS[index]);
      haptics.selection();
      onJumpRef.current(LETTERS[index], animated);
    },
    [activeIndex, fingerY],
  );

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          const pageY = event.nativeEvent.pageY;
          lastIndex.current = -1;
          settle(1);
          strip.current?.measureInWindow((_x, y) => {
            stripTop.current = y;
            jumpAt(pageY - y, true);
          });
        },
        onPanResponderMove: (_event, gesture) =>
          jumpAt(gesture.moveY - stripTop.current, false),
        onPanResponderRelease: () => {
          lastIndex.current = -1;
          settle(0);
        },
        onPanResponderTerminate: () => {
          lastIndex.current = -1;
          settle(0);
        },
      }),
    [jumpAt, settle],
  );

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: engaged.value,
    transform: [
      { translateY: fingerY.value - BUBBLE_SIZE / 2 },
      { scale: reduced ? 1 : 0.5 + 0.5 * engaged.value },
    ],
  }));

  return (
    <View
      ref={strip}
      accessibilityLabel={t('clients.indexLabel')}
      style={{
        position: 'absolute',
        top,
        right: SCRUBBER_RIGHT,
        width: SCRUBBER_WIDTH,
        height: SCRUBBER_HEIGHT,
        zIndex: 4,
      }}
      {...pan.panHandlers}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {LETTERS.map((letter, index) => (
          <Pressable
            key={letter}
            onPress={() => onJump(letter, true)}
            accessibilityRole="button"
            accessibilityLabel={t('clients.jumpTo', { letter })}
            style={{
              width: SCRUBBER_WIDTH,
              height: LETTER_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ScrubLetter
              letter={letter}
              index={index}
              isPresent={present.has(letter)}
              activeIndex={activeIndex}
              engaged={engaged}
              reduced={reduced}
              color={depth.colors.tint}
            />
          </Pressable>
        ))}
      </View>
      <Animated.View
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        testID="scrubber-bubble"
        style={[
          {
            position: 'absolute',
            top: 0,
            right: SCRUBBER_WIDTH + BUBBLE_GAP,
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
          },
          bubbleStyle,
        ]}
      >
        <Surface
          variant="floating"
          radius={BUBBLE_SIZE / 2}
          style={{
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{ color: depth.colors.tint }}
            maxFontSizeMultiplier={1}
            className="text-section font-bold"
          >
            {bubbleLetter}
          </Text>
        </Surface>
      </Animated.View>
    </View>
  );
}

interface ScrubLetterProps {
  letter: string;
  index: number;
  isPresent: boolean;
  activeIndex: SharedValue<number>;
  engaged: SharedValue<number>;
  reduced: boolean;
  color: string;
}

/** One letter: swells with its distance to the finger; at rest it is static. */
const ScrubLetter = React.memo(function ScrubLetter({
  letter,
  index,
  isPresent,
  activeIndex,
  engaged,
  reduced,
  color,
}: ScrubLetterProps) {
  const restOpacity = isPresent ? 1 : DIMMED_OPACITY;
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(index - activeIndex.value);
    const near = Math.max(0, 1 - distance / FISHEYE_REACH);
    // Reduce Motion keeps the highlight but drops the size change.
    const swell = reduced ? 0 : near * near * (ACTIVE_SCALE - 1);
    const isActive = distance < 0.5 ? engaged.value : 0;
    return {
      opacity: restOpacity + (1 - restOpacity) * isActive,
      transform: [{ scale: 1 + swell * engaged.value }],
    };
  });
  return (
    <Animated.View style={style}>
      <Text
        style={{ color, letterSpacing: 0.2 }}
        maxFontSizeMultiplier={1}
        className="text-[11px] font-bold leading-[13px]"
      >
        {letter}
      </Text>
    </Animated.View>
  );
});
