import { axisTicks, barHeight, compactMoney, niceMax } from '../chart';
import { revenueCsv } from '../csv';

describe('chart maths', () => {
  it.each([
    [0, 4],
    [3, 5],
    [1_180_000, 2_000_000],
    [1_000_000, 1_000_000],
    [4_800_000, 5_000_000],
    [5_000_001, 10_000_000],
  ])('rounds the axis top of %i up to %i', (max, expected) => {
    expect(niceMax(max)).toBe(expected);
  });

  it('puts gridlines at 0, half and the top', () => {
    expect(axisTicks(1_200_000)).toEqual([0, 600_000, 1_200_000]);
  });

  it.each([
    [0, 0],
    [1, 2],
    [600_000, 84],
    [1_200_000, 168],
  ])('draws %i cents %i px tall on a 1.2m axis', (cents, px) => {
    expect(barHeight(cents, 1_200_000, 168)).toBe(px);
  });

  it.each([
    [0, 'R0'],
    [60_000, 'R600'],
    [600_000, 'R6k'],
    [150_000, 'R1.5k'],
    [20_000_000, 'R200k'],
    [200_000_000, 'R2m'],
  ])('writes %i cents as %s', (cents, label) => {
    expect(compactMoney(cents, 'R')).toBe(label);
  });
});

describe('revenueCsv', () => {
  it('writes one row per bar with exact decimals', () => {
    expect(
      revenueCsv(
        [
          { key: '2026-10-13', cents: 682_050 },
          { key: '2026-10-14', cents: 5 },
        ],
        'ZAR',
      ),
    ).toBe('date,revenue_zar\n2026-10-13,6820.50\n2026-10-14,0.05');
  });
  it('is just the header with no bars', () => {
    expect(revenueCsv([], 'ZAR')).toBe('date,revenue_zar');
  });
});
