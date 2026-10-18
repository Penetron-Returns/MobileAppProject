import { DURATION, useDepth, useReduceMotion } from '@booking/ui';
import { Stack } from 'expo-router';
import * as React from 'react';
import { Platform } from 'react-native';

/** Android's slide reads sluggish at the iOS length: 250ms there. */
const PUSH_MS = Platform.OS === 'android' ? DURATION.standard : DURATION.page;

/** Stack options for the signed-in shell. Pure so the choice is table-testable. */
export function shellScreenOptions(opts: {
  ground: string;
  reduceMotion: boolean;
}) {
  return {
    headerShown: false,
    // Drill-in pages slide in from the right and swipe back natively; with
    // Reduce Motion they cross-fade instead of travelling.
    animation: opts.reduceMotion
      ? ('fade' as const)
      : ('slide_from_right' as const),
    animationDuration: PUSH_MS,
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
    // The ground colour behind a moving screen, so a transition never flashes white.
    contentStyle: { backgroundColor: opts.ground },
  };
}

const TABS_OPTIONS = { animation: 'none' as const };

// New booking slides up over everything, tab bar included. Swipe-down is
// off so closing always goes through the discard check.
const NEW_BOOKING_OPTIONS = {
  presentation: 'fullScreenModal' as const,
  animation: 'slide_from_bottom' as const,
  animationDuration: PUSH_MS,
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
};

// The companion sheet draws its own dim and slides itself in.
const COMPANION_OPTIONS = {
  presentation: 'transparentModal' as const,
  animation: 'none' as const,
  contentStyle: { backgroundColor: 'transparent' },
};

/**
 * The signed-in navigator. Memoised with no props and fed only stable options,
 * so the layout re-rendering (query updates, Clerk state) never re-renders it.
 */
export const ShellStack = React.memo(function ShellStack() {
  const ground = useDepth().ground.backgroundColor as string;
  const reduceMotion = useReduceMotion();
  const screenOptions = React.useMemo(
    () => shellScreenOptions({ ground, reduceMotion }),
    [ground, reduceMotion],
  );
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={TABS_OPTIONS} />
      <Stack.Screen name="new-booking" options={NEW_BOOKING_OPTIONS} />
      <Stack.Screen name="companion" options={COMPANION_OPTIONS} />
    </Stack>
  );
});
