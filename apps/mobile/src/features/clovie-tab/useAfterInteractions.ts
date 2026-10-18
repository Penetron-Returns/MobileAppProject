import * as React from 'react';

import { whenIdle } from '@/lib/whenIdle';

/**
 * False until the JS thread is idle after the first screen (or a short
 * timeout), then true for good. Mount work that is not needed for the first
 * paint behind it, so it never competes with that paint.
 */
export function useAfterInteractions(): boolean {
  const [isSettled, setIsSettled] = React.useState(false);
  React.useEffect(() => whenIdle(() => setIsSettled(true)), []);
  return isSettled;
}
