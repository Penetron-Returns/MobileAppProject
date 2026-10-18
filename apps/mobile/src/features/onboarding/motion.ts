import {
  Easing,
  ReduceMotion,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * One motion token set for the whole onboarding: the step push, the Back
 * chevron, the entrance stagger and the press feel. Reduce Motion swaps the
 * push for a short cross-fade (nothing travels), it never removes the change.
 */

/** How a step enters and leaves. */
export interface StepMotion {
  kind: 'push' | 'fade';
  /** How far, in pt, the incoming screen starts from and the outgoing one leaves to. */
  offsetPt: number;
  /** Spring duration of the push (perceived, SwiftUI style). */
  springMs: number;
  /** 1 is critically damped: no overshoot. */
  dampingRatio: number;
  enterFadeMs: number;
  exitFadeMs: number;
}

export const PUSH_MOTION: StepMotion = {
  kind: 'push',
  offsetPt: 28,
  springMs: 300,
  dampingRatio: 1,
  enterFadeMs: 220,
  exitFadeMs: 140,
};

export const FADE_MOTION: StepMotion = {
  kind: 'fade',
  offsetPt: 0,
  springMs: 150,
  dampingRatio: 1,
  enterFadeMs: 150,
  exitFadeMs: 150,
};

/** The motion for the OS Reduce Motion setting. */
export function stepMotion(isReduced: boolean): StepMotion {
  return isReduced ? FADE_MOTION : PUSH_MOTION;
}

/** Entrance stagger: 40ms apart, and nothing waits past the fourth item. */
export const STAGGER_STEP_MS = 40;
export const STAGGER_MAX_INDEX = 3;
export const RISE_PT = 10;
export const RISE_MS = 320;

/** Delay of the item at `index`, capped so a long screen never holds anything back. */
export function riseDelay(index: number): number {
  return (
    Math.min(Math.max(0, Math.floor(index)), STAGGER_MAX_INDEX) *
    STAGGER_STEP_MS
  );
}

/** The boards' gentle curve. */
export const GENTLE = Easing.bezier(0.22, 1, 0.36, 1);

/** The Back chevron fades and scales in and out when its presence changes. */
export const BACK_MS = 160;
export const BACK_SCALE = 0.8;

/** The progress pill spring. */
export const DOT_SPRING = { duration: 320, dampingRatio: 0.85 } as const;
export const DOT_ACTIVE_WIDTH = 20;
export const DOT_WIDTH = 8;

/**
 * Entering layout animation of a step. `direction` is read on the UI thread
 * when the animation starts, so Back mirrors the push exactly (1 forward, -1 back).
 */
export function stepEntering(
  motion: StepMotion,
  direction: SharedValue<number>,
) {
  return () => {
    'worklet';
    const dx = direction.value * motion.offsetPt;
    const fade = {
      duration: motion.enterFadeMs,
      easing: GENTLE,
      reduceMotion: ReduceMotion.Never,
    };
    return {
      initialValues: { opacity: 0, transform: [{ translateX: dx }] },
      animations: {
        opacity: withTiming(1, fade),
        transform: [
          {
            translateX: withSpring(0, {
              duration: motion.springMs,
              dampingRatio: motion.dampingRatio,
              reduceMotion: ReduceMotion.Never,
            }),
          },
        ],
      },
    };
  };
}

/** Exiting layout animation of a step: leaves the opposite way, fading, overlapping the entrance. */
export function stepExiting(
  motion: StepMotion,
  direction: SharedValue<number>,
) {
  return () => {
    'worklet';
    const dx = -direction.value * motion.offsetPt;
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: {
        opacity: withTiming(0, {
          duration: motion.exitFadeMs,
          easing: GENTLE,
          reduceMotion: ReduceMotion.Never,
        }),
        transform: [
          {
            translateX: withSpring(dx, {
              duration: motion.springMs,
              dampingRatio: motion.dampingRatio,
              reduceMotion: ReduceMotion.Never,
            }),
          },
        ],
      },
    };
  };
}

/** Back chevron in: fades up from 0.8. */
export function backEntering(isReduced: boolean) {
  return () => {
    'worklet';
    const config = {
      duration: BACK_MS,
      easing: GENTLE,
      reduceMotion: ReduceMotion.Never,
    };
    return {
      initialValues: {
        opacity: 0,
        transform: [{ scale: isReduced ? 1 : BACK_SCALE }],
      },
      animations: {
        opacity: withTiming(1, config),
        transform: [{ scale: withTiming(1, config) }],
      },
    };
  };
}

/** Back chevron out: fades and shrinks. */
export function backExiting(isReduced: boolean) {
  return () => {
    'worklet';
    const config = {
      duration: BACK_MS,
      easing: GENTLE,
      reduceMotion: ReduceMotion.Never,
    };
    return {
      initialValues: { opacity: 1, transform: [{ scale: 1 }] },
      animations: {
        opacity: withTiming(0, config),
        transform: [{ scale: withTiming(isReduced ? 1 : BACK_SCALE, config) }],
      },
    };
  };
}
