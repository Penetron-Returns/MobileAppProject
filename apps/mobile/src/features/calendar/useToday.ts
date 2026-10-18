import * as React from 'react';
import { AppState } from 'react-native';

import { todayISO, type ISODate } from '@/lib/time';

/** The business's today, re-checked each minute; it re-renders only when the date actually turns over. */
export function useToday(tz: string | null): ISODate | null {
  const [today, setToday] = React.useState<ISODate | null>(() =>
    tz ? todayISO(tz) : null,
  );
  React.useEffect(() => {
    if (!tz) return;
    const sync = () => setToday(todayISO(tz));
    sync();
    const id = setInterval(sync, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [tz]);
  return today;
}
