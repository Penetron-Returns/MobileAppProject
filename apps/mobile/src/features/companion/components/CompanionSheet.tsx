import {
  BEZIER,
  clampSheetHeight,
  detentHeight,
  MEDIUM_FRACTION,
  settleDetent,
  type Detent,
  DURATION,
  haptics,
  Pressable,
  useDepth,
  useReduceMotion,
} from '@booking/ui';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ClovieMood } from '../logic';
import { CompanionHeader } from './CompanionHeader';

/** The sheet stops 8pt under the status bar when full (as `FormSheet` does). */
const TOP_GAP = 8;
/** The drag handle row (Companion.dc.html: 32pt). */
const GRAB_ROW = 32;
const EASE = Easing.bezier(...BEZIER.out);

/**
 * The companion sheet of Companion.dc.html: a lit sheet over a dimmed screen
 * with a grabber and a header where Clovie reacts to the chat. It rests at a half
 * detent and drags (or the grabber taps) to full; a hard pull down, a tap on
 * the dim or the close action dismisses it. Honours reduced motion.
 */
export function CompanionSheet({
  mood,
  onClose,
  children,
}: {
  mood: ClovieMood;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: screenHeight } = useWindowDimensions();
  const usable = screenHeight - insets.top - TOP_GAP;
  const [detent, setDetent] = React.useState<Detent>('medium');
  const height = React.useRef(
    new Animated.Value(detentHeight('medium', usable)),
  ).current;
  const open = React.useRef(new Animated.Value(0)).current;
  const dragStart = React.useRef(0);
  const detentRef = React.useRef(detent);
  detentRef.current = detent;
  const usableRef = React.useRef(usable);
  usableRef.current = usable;
  const duration = reduceMotion ? 0 : DURATION.page;

  const animate = React.useCallback(
    (value: Animated.Value, to: number, done?: () => void) => {
      Animated.timing(value, {
        toValue: to,
        duration,
        easing: EASE,
        useNativeDriver: false,
      }).start(({ finished }) => finished && done?.());
    },
    [duration],
  );

  React.useEffect(() => {
    animate(open, 1);
  }, [animate, open]);

  const close = React.useCallback(() => {
    animate(open, 0, onClose);
  }, [animate, open, onClose]);

  const goTo = React.useCallback(
    (next: Detent) => {
      setDetent(next);
      animate(height, detentHeight(next, usableRef.current));
    },
    [animate, height],
  );

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          height.stopAnimation((value) => {
            dragStart.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          height.setValue(
            clampSheetHeight(dragStart.current - g.dy, usableRef.current),
          );
        },
        onPanResponderRelease: (_, g) => {
          const from = detentRef.current;
          const outcome = settleDetent({
            from,
            offset: g.dy,
            velocity: g.vy * 1000,
            height: usableRef.current,
          });
          if (outcome === 'close') {
            haptics.light();
            close();
            return;
          }
          if (outcome !== from) haptics.selection();
          goTo(outcome);
        },
      }),
    [close, goTo, height],
  );

  const translateY = open.interpolate({
    inputRange: [0, 1],
    outputRange: [usable * MEDIUM_FRACTION + 40, 0],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: depth.scrim, opacity: open },
        ]}
      >
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('companion.close')}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={t('companion.title')}
        style={[
          depth.sheet,
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height,
            transform: [{ translateY }],
            borderTopLeftRadius: 34,
            borderTopRightRadius: 34,
            overflow: 'visible',
          },
        ]}
      >
        <View {...pan.panHandlers}>
          <Pressable
            onPress={() => {
              haptics.selection();
              goTo(detent === 'large' ? 'medium' : 'large');
            }}
            accessibilityRole="button"
            accessibilityLabel={
              detent === 'large'
                ? t('companion.collapse')
                : t('companion.expand')
            }
            accessibilityState={{ expanded: detent === 'large' }}
            style={{
              height: GRAB_ROW,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{ backgroundColor: depth.grabber }}
              className="h-[5px] w-9 rounded-[3px]"
            />
          </Pressable>
        </View>
        <CompanionHeader mood={mood} />
        <View style={{ flex: 1, overflow: 'hidden' }}>{children}</View>
      </Animated.View>
    </View>
  );
}
