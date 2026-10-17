import * as React from 'react';

import { undoSecondsLeft } from '../undo';

/**
 * Whole seconds left in an undo window, re-read once a second, and only while there is time left: at rest (the window
 * closed, or the screen gone) no timer runs. `now` is injectable for tests.
 */
export function useUndoCountdown(
  undoUntilMs: number,
  now: () => number = Date.now,
): number {
  const [seconds, setSeconds] = React.useState(() =>
    undoSecondsLeft(undoUntilMs, now()),
  );
  const nowRef = React.useRef(now);
  nowRef.current = now;

  React.useEffect(() => {
    let left = undoSecondsLeft(undoUntilMs, nowRef.current());
    setSeconds(left);
    if (left <= 0) return;
    const id = setInterval(() => {
      left = undoSecondsLeft(undoUntilMs, nowRef.current());
      setSeconds(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [undoUntilMs]);

  return seconds;
}
