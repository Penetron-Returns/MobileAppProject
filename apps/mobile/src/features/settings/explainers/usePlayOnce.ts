import { useReduceMotion } from '@booking/ui';
import { useFocusEffect } from 'expo-router';
import * as React from 'react';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** One run of a scene: long enough to read, short enough to be a glance. */
export const PLAY_MS = 2400;

interface PlayOnce {
  /** 1 at rest (the finished frame); a run goes 0 to 1 once. */
  progress: SharedValue<number>;
  play: () => void;
}

/**
 * Plays a scene once when its screen is focused (after `delayMs`, to stagger
 * a page of thumbnails) and again on `play()` (a tap). It then rests on the
 * finished frame: nothing loops and nothing runs at rest. With Reduce Motion
 * on it never plays and always shows the finished frame.
 */
export function usePlayOnce(delayMs = 0): PlayOnce {
  const progress = useSharedValue(1);
  const reduceMotion = useReduceMotion();

  const run = React.useCallback(
    (delay: number) => {
      cancelAnimation(progress);
      if (reduceMotion) {
        progress.value = 1;
        return;
      }
      progress.value = 0;
      progress.value = withDelay(
        delay,
        withTiming(1, {
          duration: PLAY_MS,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.System,
        }),
      );
    },
    [progress, reduceMotion],
  );
  const play = React.useCallback(() => run(0), [run]);

  useFocusEffect(
    React.useCallback(() => {
      run(delayMs);
      return () => {
        cancelAnimation(progress);
        progress.value = 1;
      };
    }, [run, delayMs, progress]),
  );

  return { progress, play };
}
