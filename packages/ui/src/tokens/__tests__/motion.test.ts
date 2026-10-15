import {
  BEZIER,
  DURATION,
  SPRING,
  STAGGER,
  springConfig,
  staggerDelay,
  timingConfig,
} from '../motion';

describe('motion tokens', () => {
  it('holds the agreed durations in ascending order', () => {
    expect(DURATION).toEqual({
      press: 120,
      quick: 180,
      standard: 250,
      page: 300,
    });
    const values = Object.values(DURATION);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('keeps both springs damped and the snappy one stiffer', () => {
    expect(SPRING.snappy.stiffness).toBeGreaterThan(SPRING.gentle.stiffness);
    expect(SPRING.snappy.damping).toBeGreaterThan(0);
    expect(SPRING.gentle.damping).toBeGreaterThan(0);
  });

  it('keeps bezier control points inside the unit range on x', () => {
    for (const [x1, , x2] of Object.values(BEZIER)) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    [0, 0],
    [1, STAGGER.step],
    [STAGGER.maxIndex, STAGGER.maxIndex * STAGGER.step],
    [STAGGER.maxIndex + 20, STAGGER.maxIndex * STAGGER.step],
    [-3, 0],
    [2.7, 2 * STAGGER.step],
  ])('staggers row %s by %sms, capped', (index, expected) => {
    expect(staggerDelay(index)).toBe(expected);
  });

  it('hands every animation the system reduce-motion setting', () => {
    expect(timingConfig().reduceMotion).toBe('system');
    expect(timingConfig(DURATION.quick).duration).toBe(DURATION.quick);
    expect(springConfig('gentle').reduceMotion).toBe('system');
    expect(springConfig('gentle').damping).toBe(SPRING.gentle.damping);
  });
});
