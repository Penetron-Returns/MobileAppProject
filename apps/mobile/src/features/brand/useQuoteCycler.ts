import * as React from 'react';

import { nextQuoteIndex, pickStartIndex, QUOTE_INTERVAL_MS } from './quotes';

interface QuoteCyclerOptions {
  count: number;
  random?: () => number;
  intervalMs?: number;
}

/** The index of the line to show now; advances on a timer, starting at a random line. */
export function useQuoteCycler({
  count,
  random,
  intervalMs = QUOTE_INTERVAL_MS,
}: QuoteCyclerOptions): number {
  const [index, setIndex] = React.useState(() => pickStartIndex(count, random));
  React.useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(
      () => setIndex((i) => nextQuoteIndex(i, count)),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [count, intervalMs]);
  return index;
}
