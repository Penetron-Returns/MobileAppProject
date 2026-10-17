import {
  BLINK_DOUBLE_GAP_MS,
  BLINK_GAP_MIN_MS,
  BLINK_GAP_SPAN_MS,
  BLINK_SEQUENCE,
  BLINK_STEP_MS,
  nextBlink,
} from '../spriteSchedule';

/** A random source that returns the given values in turn. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('blink cadence', () => {
  it('waits 2.2 to 4.8 s after a single blink', () => {
    expect(nextBlink(false, sequence(0.9, 0)).gapMs).toBe(BLINK_GAP_MIN_MS);
    const late = nextBlink(false, sequence(0.9, 0.999));
    expect(late.gapMs).toBeCloseTo(
      BLINK_GAP_MIN_MS + 0.999 * BLINK_GAP_SPAN_MS,
    );
    expect(late.isDouble).toBe(false);
  });

  it('follows about one blink in five with a quick second blink', () => {
    expect(nextBlink(false, sequence(0.21))).toEqual({
      gapMs: BLINK_DOUBLE_GAP_MS,
      isDouble: true,
    });
    expect(nextBlink(false, sequence(0.22, 0.5)).isDouble).toBe(false);
  });

  it('never chains a third blink after a pair', () => {
    expect(nextBlink(true, sequence(0)).isDouble).toBe(false);
    expect(nextBlink(true, sequence(0, 0)).gapMs).toBe(BLINK_GAP_MIN_MS);
  });

  it('closes the eyes and ends back on open in five samples of a 0.17 s blink', () => {
    expect([0, ...BLINK_SEQUENCE]).toEqual([0, 1, 2, 1, 0]);
    expect(BLINK_STEP_MS * 5).toBeCloseTo(170, -1);
  });
});
