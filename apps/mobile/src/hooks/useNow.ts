import * as React from 'react';
import { AppState } from 'react-native';

/**
 * A clock that re-renders every `intervalMs`, so "in 20 min" and the now line
 * stay true. The timer stops while the app is backgrounded and the clock jumps
 * to the real time on return, so an idle phone does no periodic renders.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id) return;
      setNow(new Date());
      id = setInterval(() => setNow(new Date()), intervalMs);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = undefined;
    };
    if (AppState.currentState !== 'background') start();
    const sub = AppState.addEventListener('change', (s) =>
      s === 'background' ? stop() : start(),
    );
    return () => {
      sub.remove();
      stop();
    };
  }, [intervalMs]);
  return now;
}
