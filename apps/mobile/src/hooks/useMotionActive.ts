import { useReduceMotion } from '@booking/ui';
import { useIsFocused } from 'expo-router';
import * as React from 'react';
import { AppState } from 'react-native';

/** Pure gate: decorative looping motion runs only when someone can see it and has not opted out. */
export function shouldRunMotion(opts: {
  isFocused: boolean;
  isForeground: boolean;
  reduceMotion: boolean;
}): boolean {
  return opts.isFocused && opts.isForeground && !opts.reduceMotion;
}

/** True while the app is in the foreground (`active`). */
export function useIsForeground(): boolean {
  const [isForeground, setIsForeground] = React.useState(
    () => AppState.currentState !== 'background',
  );
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) =>
      setIsForeground(s === 'active'),
    );
    return () => sub.remove();
  }, []);
  return isForeground;
}

/** Focus of the enclosing screen; true when rendered outside a navigator (splash, tests). */
function useIsScreenFocused(): boolean {
  try {
    return useIsFocused();
  } catch {
    return true;
  }
}

/**
 * Whether looping idle animation (Clovie, halos) should be running: screen
 * focused, app in the foreground, and Reduce Motion off. Everything that
 * loops forever gates on this so a hidden or backgrounded app burns no frames.
 */
export function useMotionActive(): boolean {
  const isFocused = useIsScreenFocused();
  const isForeground = useIsForeground();
  const reduceMotion = useReduceMotion();
  return shouldRunMotion({ isFocused, isForeground, reduceMotion });
}
