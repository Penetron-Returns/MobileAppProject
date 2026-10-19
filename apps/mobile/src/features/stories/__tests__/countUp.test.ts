import { formatMoney } from '@/lib/format';

import {
  countTextAtStep,
  COUNT_STEPS,
  DEFAULT_CURRENCY,
  fitFontSize,
  formatCount,
} from '../countUp';
import { fpsLabel, framesPerSecond } from '../fps';

describe('the money formatter', () => {
  it.each(['ZAR', 'USD', 'EUR', 'GBP'])(
    'matches formatMoney (whole units) in %s',
    (currency) => {
      for (const cents of [0, 50, 99950, 245000, 1480000, -245000]) {
        expect(formatCount(cents, 'money', undefined, currency)).toBe(
          formatMoney(cents, currency, { decimals: false }),
        );
      }
    },
  );

  it('uses the given currency, never a hard-coded rand', () => {
    expect(formatCount(490200, 'money', undefined, 'USD')).toBe('$4,902');
    expect(formatCount(490200, 'money', undefined, 'ZAR')).toBe('R 4,902');
    expect(formatCount(490200, 'money')).toBe(
      formatCount(490200, 'money', undefined, DEFAULT_CURRENCY),
    );
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

describe('the count', () => {
  const revenue = { value: 490200, format: 'money', currency: 'ZAR' } as const;

  it('ends on the final value', () => {
    expect(countTextAtStep(revenue, COUNT_STEPS)).toBe('R 4,902');
  });

  it('starts at zero', () => {
    expect(countTextAtStep(revenue, 0)).toBe('R 0');
  });
});
