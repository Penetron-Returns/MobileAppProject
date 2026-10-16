/** How many bars the waveform draws (the board's 29). */
export const BAR_COUNT = 29;

export interface LevelStore {
  /** Adds the newest level (0..1) on the right; the oldest falls off the left. */
  push: (level: number) => void;
  reset: () => void;
  subscribe: (listener: () => void) => () => void;
  /** A new array on every change, so `useSyncExternalStore` re-renders only the waveform. */
  getSnapshot: () => readonly number[];
}

const clamp01 = (n: number) =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/**
 * The microphone level history behind the waveform. Kept outside the reducer on purpose: levels arrive ~15 times a
 * second while listening and must not re-render the drawer, only the 29 bars.
 */
export function createLevelStore(): LevelStore {
  const empty = (): readonly number[] => new Array<number>(BAR_COUNT).fill(0);
  let levels = empty();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  return {
    push(level) {
      levels = [...levels.slice(1), clamp01(level)];
      notify();
    },
    reset() {
      levels = empty();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => levels,
  };
}

/** The bell envelope and irregular peaks of the board's waveform: bar `i`'s share of the full height. */
export function barShape(i: number): number {
  const env = Math.exp(-Math.pow((i - 14) / 8.5, 2));
  const jag = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.3 + 1.1));
  return env * jag;
}

export const BAR_MIN = 8;
export const BAR_MAX = 46;
/** Speech sits around 0.1 to 0.6 on the native meter: scaled up so ordinary talking fills the bars. */
const LEVEL_GAIN = 1.5;

/** Height of bar `i` for a level; the board's resting heights when `level` is null (motion off). */
export function barHeight(i: number, level: number | null): number {
  const share = level === null ? 1 : Math.min(1, level * LEVEL_GAIN);
  return Math.max(BAR_MIN, Math.round(BAR_MAX * barShape(i) * share));
}
