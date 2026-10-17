/** Time a card stays on screen. */
export const CARD_MS = 5000;

/** Cube turn between stories, slide between cards, and the lead-in before the cube starts. */
export const CUBE_MS = 620;
export const SLIDE_MS = 360;
export const CUBE_LEAD_MS = 420;
/** Clovie's travel to his next spot. */
export const TRAVEL_MS = 850;
/** Inputs are ignored while a transition plays. */
export const LOCK_MS = {
  card: SLIDE_MS,
  story: CUBE_LEAD_MS + CUBE_MS,
} as const;

/** Fill of segment `index` while `current` is showing at `progress` (0..1). */
export function segmentFill(
  index: number,
  current: number,
  progress: number,
): number {
  if (index < current) return 1;
  if (index > current) return 0;
  return Math.min(1, Math.max(0, progress));
}

/** Ms left on a card after a hold, so resuming continues rather than restarts. */
export function remainingMs(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return Math.round((1 - p) * CARD_MS);
}
