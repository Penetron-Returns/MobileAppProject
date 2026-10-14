import * as React from 'react';

/** A clock that re-renders every `intervalMs`, so "in 20 min" and the now line stay true. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
