import * as React from 'react';

import { BLINK_SEQUENCE, BLINK_STEP_MS, nextBlink } from './spriteSchedule';

/**
 * The sprite index (0 open, 1 half, 2 shut) of a blinking companion. State
 * changes only during a blink, a handful of times every few seconds, and
 * nothing is scheduled while `isActive` is false. Rests on open.
 */
export function useBlinkFrame(isActive: boolean): 0 | 1 | 2 {
  const [frame, setFrame] = React.useState<0 | 1 | 2>(0);
  React.useEffect(() => {
    if (!isActive) {
      setFrame(0);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wasDouble = false;
    const playFrom = (step: number) => {
      setFrame(BLINK_SEQUENCE[step]);
      if (step + 1 < BLINK_SEQUENCE.length) {
        timer = setTimeout(() => playFrom(step + 1), BLINK_STEP_MS);
        return;
      }
      const next = nextBlink(wasDouble, Math.random);
      wasDouble = next.isDouble;
      timer = setTimeout(() => playFrom(0), next.gapMs);
    };
    // A first blink soon after he appears, then the library's own cadence.
    const first = nextBlink(true, Math.random);
    timer = setTimeout(() => playFrom(0), first.gapMs);
    return () => clearTimeout(timer);
  }, [isActive]);
  return frame;
}
