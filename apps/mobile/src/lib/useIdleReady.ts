import * as React from 'react';

import { whenIdle } from './whenIdle';

/**
 * False for the first render, true once the JS thread has been idle (after an
 * optional extra `delayMs`). For work that should not compete with the first
 * screen: pre-mounting other tabs, minting sessions, starting analytics.
 */
export function useIdleReady(delayMs = 0): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelIdle = whenIdle(() => {
      if (delayMs <= 0) setReady(true);
      else timer = setTimeout(() => setReady(true), delayMs);
    });
    return () => {
      cancelIdle();
      if (timer) clearTimeout(timer);
    };
  }, [delayMs]);
  return ready;
}
