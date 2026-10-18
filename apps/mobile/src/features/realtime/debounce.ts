/**
 * Trailing debounce per key: a burst of events for one table runs `run` once,
 * `delayMs` after the last event. Timers are injected so tests never sleep.
 */
export function createKeyedDebouncer<K extends string>(
  run: (key: K) => void,
  delayMs: number,
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (id: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
) {
  const pending = new Map<K, unknown>();
  return {
    schedule(key: K) {
      const existing = pending.get(key);
      if (existing !== undefined) timers.clear(existing);
      pending.set(
        key,
        timers.set(() => {
          pending.delete(key);
          run(key);
        }, delayMs),
      );
    },
    cancelAll() {
      for (const id of pending.values()) timers.clear(id);
      pending.clear();
    },
  };
}
