import { formatMoney } from '@/lib/format';

import { countDefaultText, fitFontSize, formatCount } from '../countUp';
import { fpsLabel, framesPerSecond } from '../fps';

describe('the worklet money formatter', () => {
  it.each([
    0, 1, 49, 50, 99, 100, 149, 150, 249, 250, 99950, 100000, 245000, 1234567,
    1480000, 99999999, 123456789012, -50, -149, -245000, -1480000,
  ])('matches formatMoney (ZAR, whole rand) for %i cents', (cents) => {
    expect(formatCount(cents, 'money')).toBe(
      formatMoney(cents, 'ZAR', { decimals: false }),
    );
  });

  it('is a worklet, so it can run on the UI thread', () => {
    // The Reanimated babel plugin tags worklets with a workletHash.
    expect(
      (formatCount as unknown as { __workletHash?: number }).__workletHash,
    ).toBeDefined();
  });
});

describe('fitFontSize', () => {
  it('keeps the base size when the number fits', () => {
    expect(fitFontSize('R 2,450', 354, 88)).toBe(88);
  });

  it('shrinks a long number to the width it has', () => {
    const size = fitFontSize('R 1,480,000', 354, 88);
    expect(size).toBeLessThan(88);
    expect(size).toBeGreaterThan(40);
  });
});

describe('fps meter maths', () => {
  it('counts frames per second over an interval', () => {
    expect(framesPerSecond(30, 500)).toBe(60);
    expect(framesPerSecond(15, 500)).toBe(30);
    expect(framesPerSecond(0, 0)).toBe(0);
  });

  it('formats one line', () => {
    expect(fpsLabel(60, 58)).toBe('UI 60  JS 58');
  });
});

describe('countDefaultText', () => {
  const revenue = { value: 490200, format: 'money' } as const;

  it('starts an entering card from 0', () => {
    expect(
      countDefaultText(revenue, { isCurrent: true, isReduced: false }),
    ).toBe('R 0');
  });

  it('keeps the final value on a card that is leaving', () => {
    expect(
      countDefaultText(revenue, { isCurrent: false, isReduced: false }),
    ).toBe('R 4,902');
  });

  it('shows the final value at once under reduce motion', () => {
    expect(
      countDefaultText(revenue, { isCurrent: true, isReduced: true }),
    ).toBe('R 4,902');
  });
});
