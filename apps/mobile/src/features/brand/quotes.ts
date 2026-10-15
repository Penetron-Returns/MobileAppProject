/** How long each loading line stays before the next one cross-fades in. */
export const QUOTE_INTERVAL_MS = 2400;

/**
 * Where the loading lines start each launch. `random` is injected (defaults to
 * Math.random) so tests are deterministic.
 */
export function pickStartIndex(
  count: number,
  random: () => number = Math.random,
): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.floor(random() * count));
}

/** The line after `index`, wrapping around. */
export function nextQuoteIndex(index: number, count: number): number {
  return count <= 0 ? 0 : (index + 1) % count;
}
