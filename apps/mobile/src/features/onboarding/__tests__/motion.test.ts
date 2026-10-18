import {
  FADE_MOTION,
  PUSH_MOTION,
  STAGGER_MAX_INDEX,
  STAGGER_STEP_MS,
  riseDelay,
  stepMotion,
} from '../motion';

describe('stepMotion', () => {
  it('pushes by default', () => {
    expect(stepMotion(false)).toBe(PUSH_MOTION);
    expect(PUSH_MOTION.offsetPt).toBeGreaterThanOrEqual(24);
    expect(PUSH_MOTION.offsetPt).toBeLessThanOrEqual(32);
    expect(PUSH_MOTION.springMs).toBeGreaterThanOrEqual(280);
    expect(PUSH_MOTION.springMs).toBeLessThanOrEqual(320);
  });

  it('cross-fades in 150ms without travelling under Reduce Motion', () => {
    const m = stepMotion(true);
    expect(m).toBe(FADE_MOTION);
    expect(m.offsetPt).toBe(0);
    expect(m.enterFadeMs).toBe(150);
    expect(m.exitFadeMs).toBe(150);
  });
});

describe('riseDelay', () => {
  it.each([
    [0, 0],
    [1, STAGGER_STEP_MS],
    [3, 3 * STAGGER_STEP_MS],
    [4, STAGGER_MAX_INDEX * STAGGER_STEP_MS],
    [20, STAGGER_MAX_INDEX * STAGGER_STEP_MS],
    [-2, 0],
  ])('item %i waits %ims', (index, ms) => {
    expect(riseDelay(index)).toBe(ms);
  });

  it('steps are at most 40ms and never delay past ~120ms', () => {
    expect(STAGGER_STEP_MS).toBeLessThanOrEqual(40);
    expect(riseDelay(99)).toBeLessThanOrEqual(120);
  });
});
