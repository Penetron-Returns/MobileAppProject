import { currencySymbol, formatMoney, formatPrice } from '@/lib/format';

describe('formatPrice', () => {
  it.each([
    [0, 'ZAR', 'R0'],
    [20000, 'ZAR', 'R200'],
    [125000, 'ZAR', 'R1,250'],
    [450, 'ZAR', 'R4.50'],
    [405, 'ZAR', 'R4.05'],
    [-1600, 'ZAR', '-R16'],
    [20000, 'USD', '$200'],
    [450, 'USD', '$4.50'],
    [1600, 'GBP', '£16'],
    [1600, 'EUR', '€16'],
    [1600, 'KES', 'KSh16'],
  ])('writes %i cents in %s as %s', (cents, currency, expected) => {
    expect(formatPrice(cents, currency)).toBe(expected);
  });
});

describe('formatMoney', () => {
  it.each([
    [125000, 'ZAR', undefined, 'R 1,250.00'],
    [125000, 'USD', undefined, '$1,250.00'],
    [125000, 'USD', { decimals: false }, '$1,250'],
    [125050, 'GBP', { decimals: 'auto' as const }, '£1,250.50'],
    [-500, 'USD', undefined, '-$5.00'],
    [null, 'USD', undefined, '$0.00'],
  ])('writes %s cents in %s (%j) as %s', (cents, currency, opts, expected) => {
    expect(formatMoney(cents, currency, opts)).toBe(expected);
  });
});

describe('currencySymbol', () => {
  it.each([
    ['usd', '$'],
    ['ZAR', 'R'],
    ['JPY', '¥'],
    ['CHF', 'CHF'],
    ['???', '???'],
  ])('%s is %s', (code, expected) => {
    expect(currencySymbol(code)).toBe(expected);
  });
});
