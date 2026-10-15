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

  it('maps the springs to SwiftUI smooth, snappy and bouncy (500ms, bounce 0 / 0.15 / 0.3)', () => {
    expect(SPRING).toEqual({
      smooth: { duration: 500, dampingRatio: 1 },
      snappy: { duration: 500, dampingRatio: 0.85 },
      bouncy: { duration: 500, dampingRatio: 0.7 },
    });
  });

  it('keeps the springs ordered from least to most bounce', () => {
    expect(SPRING.smooth.dampingRatio).toBeGreaterThan(
      SPRING.snappy.dampingRatio,
    );
    expect(SPRING.snappy.dampingRatio).toBeGreaterThan(
      SPRING.bouncy.dampingRatio,
    );
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
    expect(springConfig('smooth').reduceMotion).toBe('system');
    expect(springConfig('bouncy').dampingRatio).toBe(
      SPRING.bouncy.dampingRatio,
    );
    expect(springConfig('bouncy').duration).toBe(SPRING.bouncy.duration);
  });
});
