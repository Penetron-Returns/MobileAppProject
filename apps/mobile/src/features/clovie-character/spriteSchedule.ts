/**
 * The blink cadence of the real companion (bot-avatars `BotAvatarSim`): after a
 * blink the next one comes 2.2 to 4.8 s later, and about one in five blinks is
 * followed by a second one 0.28 s after it. A blink lasts 0.17 s and closes the
 * eyes as sin(pi * p): open, half, shut, half, open.
 */
export const BLINK_GAP_MIN_MS = 2200;
export const BLINK_GAP_SPAN_MS = 2600;
export const BLINK_DOUBLE_GAP_MS = 280;
export const BLINK_DOUBLE_CHANCE = 0.22;
export const BLINK_DURATION_MS = 170;

/** Sprite indices (0 open, 1 half, 2 shut) of a blink, ending back on open. */
export const BLINK_SEQUENCE = [1, 2, 1, 0] as const;
/** Time each sprite of the sequence is held: the five samples of sin(pi * p) span the blink. */
export const BLINK_STEP_MS = Math.round(BLINK_DURATION_MS / 5);

export interface NextBlink {
  /** Time until the next blink starts. */
  gapMs: number;
  /** True when that blink is the quick second one of a pair. */
  isDouble: boolean;
}

/**
 * Plans the blink after one that just fired. A pair never chains into a third
 * blink. `random` returns [0, 1) and is injected so the plan is deterministic in tests.
 */
export function nextBlink(wasDouble: boolean, random: () => number): NextBlink {
  const isDouble = !wasDouble && random() < BLINK_DOUBLE_CHANCE;
  const gapMs = isDouble
    ? BLINK_DOUBLE_GAP_MS
    : BLINK_GAP_MIN_MS + random() * BLINK_GAP_SPAN_MS;
  return { gapMs, isDouble };
}
