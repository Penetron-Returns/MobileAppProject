/** How long a KPI number takes to count to its value. */
export const COUNT_UP_MS = 700;

/** Ease-out cubic: fast start, gentle landing. `t` is clamped to 0..1. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/**
 * The number to show `elapsedMs` into a count from `from` to `to`. Rounded to
 * a whole unit (cents stay integers) and exactly `to` once the duration is up.
 */
export function countUpValue(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number = COUNT_UP_MS,
): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  return Math.round(from + (to - from) * easeOutCubic(elapsedMs / durationMs));
}
