import {
  BLINK,
  EYES,
  isDoubleBlink,
  nextBlinkDelayMs,
  startBlinkLoop,
  type BlinkClock,
} from '../blink';

/** A manual clock: timers fire only when the test advances time. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: BlinkClock = {
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (id) => {
      timers.delete(id as number);
    },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    now = end;
  };
  return { clock, advance, pending: () => timers.size };
}

describe('blink spec', () => {
  it('keeps the eye positions and lid colour from the board', () => {
    expect(EYES).toMatchObject({ leftX: 37, rightX: 62, y: 47, w: 13, h: 17 });
    expect(EYES.lidColor).toBe('#3BA6DC');
    expect(BLINK.closeMs).toBe(60);
    expect(BLINK.openMs).toBe(80);
  });

  it.each([
    [0, false, 3000],
    [1, false, 6000],
    [0.5, false, 4500],
    [0, true, 4800],
    [1, true, 9600],
  ])('gap for random %s (sleepy %s) is %s ms', (r, sleepy, expected) => {
    expect(nextBlinkDelayMs(() => r, sleepy)).toBeCloseTo(expected, 5);
  });

  it('double-blinks 15% of the time', () => {
    expect(isDoubleBlink(() => 0.14)).toBe(true);
    expect(isDoubleBlink(() => 0.15)).toBe(false);
  });
});

describe('startBlinkLoop', () => {
  it('blinks on the randomised interval and keeps going', () => {
    const { clock, advance } = fakeClock();
    const onBlink = jest.fn();
    startBlinkLoop({
      random: () => 0.5,
      clock,
      isSleepy: () => false,
      onBlink,
    });
    advance(4499);
    expect(onBlink).not.toHaveBeenCalled();
    advance(1);
    expect(onBlink).toHaveBeenCalledTimes(1);
    advance(4500);
    expect(onBlink).toHaveBeenCalledTimes(2);
  });

  it('follows a blink with a second one 230 ms later when the double roll hits', () => {
    const { clock, advance } = fakeClock();
    const onBlink = jest.fn();
    // gap roll 0 (3 s), double roll 0.1 (hit), then a long next gap roll 0.9.
    const rolls = [0, 0.1, 0.9, 0.9];
    startBlinkLoop({
      random: () => rolls.shift() ?? 0.9,
      clock,
      isSleepy: () => false,
      onBlink,
    });
    advance(3000);
    expect(onBlink).toHaveBeenCalledTimes(1);
    advance(229);
    expect(onBlink).toHaveBeenCalledTimes(1);
    advance(1);
    expect(onBlink).toHaveBeenCalledTimes(2);
  });

  it('is slower when sleepy', () => {
    const { clock, advance } = fakeClock();
    const onBlink = jest.fn();
    startBlinkLoop({ random: () => 0, clock, isSleepy: () => true, onBlink });
    advance(4799);
    expect(onBlink).not.toHaveBeenCalled();
    advance(1);
    expect(onBlink).toHaveBeenCalledTimes(1);
  });

  it('stops cleanly and leaves no timers behind', () => {
    const { clock, advance, pending } = fakeClock();
    const onBlink = jest.fn();
    const stop = startBlinkLoop({
      random: () => 0,
      clock,
      isSleepy: () => false,
      onBlink,
    });
    stop();
    advance(60000);
    expect(onBlink).not.toHaveBeenCalled();
    expect(pending()).toBe(0);
  });
});
