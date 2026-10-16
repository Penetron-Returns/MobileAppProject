import { Text, haptics, useDepth } from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { PanResponder, Pressable, View } from 'react-native';

import { LETTERS, letterIndexAt } from '../phoneBook';

/** Board metrics: a 28pt column, 18pt per letter, 486pt tall. */
export const SCRUBBER_WIDTH = 28;
export const SCRUBBER_HEIGHT = 486;
const DIMMED_OPACITY = 0.35;

interface IndexScrubberProps {
  /** Letters that have at least one client. */
  present: ReadonlySet<string>;
  onJump: (letter: string) => void;
  top: number;
}

/**
 * The A-Z strip on the right edge. A tap or a drag along it jumps to that
 * letter; letters with no clients are dimmed. Screen readers get one button
 * per letter.
 */
export function IndexScrubber({ present, onJump, top }: IndexScrubberProps) {
  const { t } = useTranslation();
  const depth = useDepth();
  const strip = React.useRef<View>(null);
  const stripTop = React.useRef(0);
  const lastIndex = React.useRef(-1);
  const onJumpRef = React.useRef(onJump);
  onJumpRef.current = onJump;

  const jumpAt = React.useCallback((y: number) => {
    const index = letterIndexAt(y, SCRUBBER_HEIGHT);
    if (index === lastIndex.current) return;
    lastIndex.current = index;
    haptics.selection();
    onJumpRef.current(LETTERS[index]);
  }, []);

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
          strip.current?.measureInWindow((_x, y) => {
            stripTop.current = y;
            jumpAt(pageY - y);
          });
        },
        onPanResponderMove: (_event, gesture) =>
          jumpAt(gesture.moveY - stripTop.current),
        onPanResponderRelease: () => {
          lastIndex.current = -1;
        },
      }),
    [jumpAt],
  );

  return (
    <View
      ref={strip}
      accessibilityLabel={t('clients.indexLabel')}
      style={{
        top,
        width: SCRUBBER_WIDTH,
        height: SCRUBBER_HEIGHT,
        zIndex: 4,
      }}
      className="absolute right-0.5 items-center justify-between"
      {...pan.panHandlers}
    >
      {LETTERS.map((letter) => (
        <Pressable
          key={letter}
          onPress={() => onJump(letter)}
          accessibilityRole="button"
          accessibilityLabel={t('clients.jumpTo', { letter })}
          style={{
            width: SCRUBBER_WIDTH,
            height: 18,
            opacity: present.has(letter) ? 1 : DIMMED_OPACITY,
          }}
          className="items-center justify-center"
        >
          <Text
            style={{ color: depth.colors.tint, letterSpacing: 0.2 }}
            maxFontSizeMultiplier={1}
            className="text-[11px] font-bold leading-[13px]"
          >
            {letter}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
