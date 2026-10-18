/**
 * Runs `task` when the JS thread is idle (or after `timeoutMs` at the latest)
 * and returns a cancel function. `requestIdleCallback` replaces the deprecated
 * `InteractionManager`; where it is missing (tests, web) a short timer stands in.
 */
export function whenIdle(task: () => void, timeoutMs = 1500): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(task, { timeout: timeoutMs });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(task, 0);
  return () => clearTimeout(id);
}
