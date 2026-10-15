import {
  COLLAPSE_FADE,
  OVERSCROLL_SCALE_MAX,
  OVERSCROLL_RANGE,
  collapseThreshold,
  titleCollapse,
} from '../titleCollapse';

describe('collapseThreshold', () => {
  it.each([
    [150, 100, 50],
    [90, 100, 0],
    [100, 100, 0],
  ])('title bottom %s under a bar ending at %s collapses at %s', (a, b, e) => {
    expect(collapseThreshold(a, b)).toBe(e);
  });
});

describe('titleCollapse', () => {
  const T = 50;

  it.each([
    [-100, 0],
    [0, 0],
    [T, 0],
    [T + COLLAPSE_FADE / 2, 0.5],
    [T + COLLAPSE_FADE, 1],
    [T + 500, 1],
  ])('offset %s gives bar opacity %s', (offset, expected) => {
    expect(titleCollapse(offset, T, false).barOpacity).toBeCloseTo(expected);
  });

  it('does not scale the title while scrolling up the list', () => {
    expect(titleCollapse(0, T, false).titleScale).toBe(1);
    expect(titleCollapse(200, T, false).titleScale).toBe(1);
  });

  it('stretches the title with overscroll, capped', () => {
    expect(
      titleCollapse(-OVERSCROLL_RANGE / 2, T, false).titleScale,
    ).toBeCloseTo(1 + OVERSCROLL_SCALE_MAX / 2);
    expect(titleCollapse(-5000, T, false).titleScale).toBeCloseTo(
      1 + OVERSCROLL_SCALE_MAX,
    );
  });

  it('switches instantly at the threshold under reduced motion', () => {
    expect(titleCollapse(T - 1, T, true)).toEqual({
      barOpacity: 0,
      titleScale: 1,
    });
    expect(titleCollapse(T, T, true)).toEqual({ barOpacity: 1, titleScale: 1 });
    expect(titleCollapse(-300, T, true).titleScale).toBe(1);
  });
});
