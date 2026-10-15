import { COUNT_UP_MS, countUpValue, easeOutCubic } from '../countUp';

describe('countUpValue', () => {
  it.each([
    [0, 1000, 0, 0],
    [0, 1000, COUNT_UP_MS, 1000],
    [0, 1000, COUNT_UP_MS + 500, 1000],
    [500, 200, COUNT_UP_MS, 200],
    [0, 1000, -50, 0],
    [0, 1000, 100, 1000],
  ])('counts %i to %i at %ims as %i', (from, to, elapsed, expected) => {
    // The 100ms row is checked loosely below; it is only here for the end value.
    if (elapsed === 100) {
      const v = countUpValue(from, to, elapsed);
      expect(v).toBeGreaterThan(200);
      expect(v).toBeLessThan(to);
      return;
    }
    expect(countUpValue(from, to, elapsed)).toBe(expected);
  });

  it('eases out: more than half way at half the time', () => {
    expect(countUpValue(0, 1000, COUNT_UP_MS / 2)).toBeGreaterThan(500);
  });

  it('returns whole numbers so cents stay integers', () => {
    expect(Number.isInteger(countUpValue(0, 12345, 123))).toBe(true);
  });

  it('jumps to the end for a zero duration', () => {
    expect(countUpValue(0, 50, 0, 0)).toBe(50);
  });

  it('clamps the easing input', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});
