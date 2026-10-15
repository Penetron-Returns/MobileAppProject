import { Easing, ReduceMotion } from 'react-native-reanimated';

/**
 * Motion tokens: the single source for every animation in the app. Every
 * Reanimated animation passes `reduceMotion: ReduceMotion.System`, so the OS
 * "reduce motion" setting makes it instant (see `timingConfig`/`springConfig`).
 */

/** Durations in milliseconds. */
export const DURATION = {
  /** Press feedback (scale, shadow): the design's 120ms ease. */
  press: 120,
  /** Small state changes: chevron turn, switch track colour, fades. */
  quick: 180,
  /** Indicator slides, list entrances, toasts. */
  standard: 250,
  /** Screen transitions and the presenting-screen scale. */
  page: 300,
} as const;

/** Cubic-bezier control points, for APIs that want data (CSS-like). */
export const BEZIER = {
  /** CSS `ease`, the design's press curve. */
  standard: [0.25, 0.1, 0.25, 1],
  /** Decelerate: things arriving. */
  out: [0, 0, 0.2, 1],
  /** Accelerate then decelerate: things moving across the screen. */
  inOut: [0.4, 0, 0.2, 1],
} as const;

/** Reanimated easing functions built from `BEZIER`. */
export const EASING = {
  standard: Easing.bezier(...BEZIER.standard),
  out: Easing.bezier(...BEZIER.out),
  inOut: Easing.bezier(...BEZIER.inOut),
} as const;

/**
 * Spring configs, mapped one-to-one to SwiftUI's `Animation` presets and used
 * as `withSpring({ duration, dampingRatio })`, where `dampingRatio = 1 - bounce`.
 * Plain objects, so they are safe to read inside a worklet.
 */
export const SPRING = {
  /** SwiftUI `.smooth` (bounce 0): layout changes, sheets, toasts, page-level moves. */
  smooth: { duration: 500, dampingRatio: 1, reduceMotion: ReduceMotion.System },
  /** SwiftUI `.snappy` (bounce 0.15): selection pills, switch thumbs, chips. */
  snappy: {
    duration: 500,
    dampingRatio: 0.85,
    reduceMotion: ReduceMotion.System,
  },
  /** SwiftUI `.bouncy` (bounce 0.3): celebrations only (the success mark). */
  bouncy: {
    duration: 500,
    dampingRatio: 0.7,
    reduceMotion: ReduceMotion.System,
  },
} as const;

/**
 * Precomputed `withTiming` configs (reduce-motion aware). Plain objects: inside
 * a worklet (`useAnimatedStyle`, `useDerivedValue`, gesture callbacks) use
 * these and never call `timingConfig()`, which is a JS function and crashes
 * the UI runtime ("Tried to synchronously call a Remote Function").
 */
export const TIMING = {
  press: {
    duration: DURATION.press,
    easing: EASING.standard,
    reduceMotion: ReduceMotion.System,
  },
  quick: {
    duration: DURATION.quick,
    easing: EASING.standard,
    reduceMotion: ReduceMotion.System,
  },
  standard: {
    duration: DURATION.standard,
    easing: EASING.standard,
    reduceMotion: ReduceMotion.System,
  },
  standardOut: {
    duration: DURATION.standard,
    easing: EASING.out,
    reduceMotion: ReduceMotion.System,
  },
  page: {
    duration: DURATION.page,
    easing: EASING.standard,
    reduceMotion: ReduceMotion.System,
  },
  pageInOut: {
    duration: DURATION.page,
    easing: EASING.inOut,
    reduceMotion: ReduceMotion.System,
  },
} as const;

/** Scale values for press and pop feedback. */
export const SCALE = {
  /** Small controls and rows while pressed. */
  pressed: 0.97,
  /** Large round buttons (the + button, the Inbox dome) while pressed. */
  pressedLarge: 0.94,
  /** Peak of the tab icon pop. */
  pop: 1.12,
} as const;

/** `withTiming` config that honours the OS reduce-motion setting. JS thread only: inside a worklet use `TIMING`. */
export function timingConfig(
  duration: number = DURATION.standard,
  easing: (typeof EASING)[keyof typeof EASING] = EASING.standard,
) {
  return { duration, easing, reduceMotion: ReduceMotion.System } as const;
}

/** `withSpring` config that honours the OS reduce-motion setting. JS thread only: inside a worklet use `SPRING`. */
export function springConfig(spring: keyof typeof SPRING = 'snappy') {
  return SPRING[spring];
}

/** Stagger between list rows, and the most rows that get a delay. */
export const STAGGER = { step: 40, maxIndex: 8 } as const;

/** Entrance delay of the row at `index`: capped so long lists never wait. */
export function staggerDelay(index: number): number {
  const capped = Math.min(Math.max(0, Math.floor(index)), STAGGER.maxIndex);
  return capped * STAGGER.step;
}

/**
 * Legacy overlay durations (Sheet, Toast, scrims); kept so existing call
 * sites read from one table. Prefer `DURATION` for new code.
 */
export const MOTION = {
  /** Overlay fade out. */
  fast: 150,
  /** Overlay fade in. */
  base: 200,
  /** Sheet slide in. */
  sheetIn: 220,
  /** Sheet slide out. */
  sheetOut: 180,
} as const;

/** How long a toast stays: errors linger, confirmations do not. */
export const TOAST_TTL = { default: 4500, error: 7000 } as const;
