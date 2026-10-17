/** Blink spec from the design board. Eye positions are % of the image box. */
export const EYES = {
  leftX: 37,
  rightX: 62,
  y: 47,
  w: 13,
  h: 17,
  lidColor: '#3BA6DC',
} as const;

export const BLINK = {
  closeMs: 60,
  openMs: 80,
  minGapMs: 3000,
  spanMs: 3000,
  doubleChance: 0.15,
  doubleGapMs: 230,
  sleepyFactor: 1.6,
  sleepyDoubleGapMs: 800,
  /** Sleepy blink: half-shut, fully shut, half-shut (30% / 65% stops of 640 ms). */
  sleepyCloseMs: 192,
  sleepyHoldMs: 224,
  sleepyOpenMs: 224,
} as const;

/** 3 to 6 s between blinks; sleepy is 1.6x slower. */
export function nextBlinkDelayMs(random: () => number, isSleepy: boolean) {
  const gap = BLINK.minGapMs + random() * BLINK.spanMs;
  return isSleepy ? gap * BLINK.sleepyFactor : gap;
}

/** 15% of blinks are followed by a second one. */
export function isDoubleBlink(random: () => number) {
  return random() < BLINK.doubleChance;
}

export interface BlinkClock {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
}

export interface BlinkLoopOptions {
  random: () => number;
  clock: BlinkClock;
  isSleepy: () => boolean;
  onBlink: () => void;
}

/** Starts the randomised blink timer and returns a stop function. */
export function startBlinkLoop(options: BlinkLoopOptions): () => void {
  const { random, clock, isSleepy, onBlink } = options;
  const ids = new Set<unknown>();
  let isStopped = false;

  const later = (fn: () => void, ms: number) => {
    const id: unknown = clock.setTimer(() => {
      ids.delete(id);
      if (!isStopped) fn();
    }, ms);
    ids.add(id);
  };

  const schedule = () => {
    later(
      () => {
        onBlink();
        if (isDoubleBlink(random)) {
          later(
            onBlink,
            isSleepy() ? BLINK.sleepyDoubleGapMs : BLINK.doubleGapMs,
          );
        }
        schedule();
      },
      nextBlinkDelayMs(random, isSleepy()),
    );
  };
  schedule();

  return () => {
    isStopped = true;
    ids.forEach((id) => clock.clearTimer(id));
    ids.clear();
  };
}
