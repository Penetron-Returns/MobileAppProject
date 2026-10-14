/**
 * Motion durations, in milliseconds. Animations pass `ReduceMotion.System`
 * so they are skipped when the OS asks for reduced motion.
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
