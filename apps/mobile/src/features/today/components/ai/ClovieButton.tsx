import {
  SCALE,
  TIMING,
  useDepth,
  useReduceMotion,
  withAlpha,
} from '@booking/ui';
import { MessageCircle } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Outer diameter of the pressable ring and the hit area (well over 44 pt). */
export const CLOVIE_BUTTON_SIZE = 152;
const RING_WIDTH = 1.25;
const BADGE_SIZE = 24;
const BADGE_RING = 2;
/** Resting ring opacity; press-in brightens it to 1. */
const RING_REST = 0.6;

/** Badge centre sits on the ring at 45 degrees (bottom-right). */
const BADGE_OFFSET =
  CLOVIE_BUTTON_SIZE / 2 +
  (CLOVIE_BUTTON_SIZE / 2) * Math.SQRT1_2 -
  BADGE_SIZE / 2;

/**
 * Makes the hero Clovie read as a button: a thin static ring around him and a
 * calm chat badge on his corner. Both are plain views, so Home still draws no
 * frames at rest. Only the press feedback animates (UI thread, on touch):
 * the ring brightens and Clovie dips to 0.97; under Reduce Motion only the
 * ring brightens.
 */
export function ClovieButton({
  onPress,
  children,
}: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: RING_REST + (1 - RING_REST) * pressed.value,
  }));
  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - SCALE.pressed) * pressed.value }],
  }));
  const press = (to: 0 | 1) => () => {
    pressed.value = withTiming(to, TIMING.press);
  };
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press(1)}
      onPressOut={press(0)}
      accessibilityRole="button"
      accessibilityLabel={t('today.ai.openClovie')}
      accessibilityHint={t('today.ai.openClovieHint')}
      hitSlop={8}
      style={{
        position: 'absolute',
        top: 4,
        width: CLOVIE_BUTTON_SIZE,
        height: CLOVIE_BUTTON_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        testID="clovie-button-ring"
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: CLOVIE_BUTTON_SIZE,
            height: CLOVIE_BUTTON_SIZE,
            borderRadius: CLOVIE_BUTTON_SIZE / 2,
            borderWidth: RING_WIDTH,
            borderColor: withAlpha(depth.colors.tint, 0.3),
          },
          ringStyle,
        ]}
      />
      <Animated.View
        testID="clovie-button-body"
        pointerEvents="none"
        style={reduceMotion ? undefined : scaleStyle}
      >
        {children}
      </Animated.View>
      <View
        testID="clovie-chat-badge"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          left: BADGE_OFFSET,
          top: BADGE_OFFSET,
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: BADGE_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: depth.colors.tint,
          borderWidth: BADGE_RING,
          borderColor: depth.ground.backgroundColor,
          boxShadow: depth.raised.boxShadow,
        }}
      >
        <MessageCircle
          size={12}
          color={depth.colors.onFill}
          strokeWidth={2.5}
        />
      </View>
    </Pressable>
  );
}
