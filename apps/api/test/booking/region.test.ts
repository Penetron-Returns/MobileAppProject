import { describe, expect, it } from 'vitest';

import { normalizePhone, tryNormalizePhone } from '@booking/features/lib/phone.ts';
import { regionForBusiness } from '@booking/features/lib/region.ts';

describe('regionForBusiness', () => {
  it.each([
    [{ timezone: 'Africa/Johannesburg', currency: 'ZAR' }, 'ZA'],
    [{ timezone: 'America/New_York', currency: 'USD' }, 'US'],
    [{ timezone: 'Europe/London', currency: 'GBP' }, 'GB'],
    [{ timezone: 'Europe/Berlin', currency: 'EUR' }, 'DE'],
    [{ timezone: 'UTC', currency: 'GBP' }, 'GB'],
    [{ timezone: 'Africa/Windhoek', currency: 'ZAR' }, 'NA'],
    [{ timezone: 'UTC', currency: 'EUR' }, null],
    [{ timezone: 'UTC', currency: 'USD' }, 'US'],
    [{ timezone: null, currency: null }, null],
    [{}, null],
  ])('%j reads as %s', (business, expected) => {
    expect(regionForBusiness(business)).toBe(expected);
  });
});

describe('phone region', () => {
  it.each([
    ['0821234567', 'ZA', '+27821234567'],
    ['(201) 555-0123', 'US', '+12015550123'],
    ['07911 123456', 'GB', '+447911123456'],
    ['+44 7911 123456', 'ZA', '+447911123456'],
    ['+44 7911 123456', null, '+447911123456'],
    ['0044 7911 123456', null, '+447911123456'],
  ])('%s in %s → %s', (input, region, expected) => {
    expect(normalizePhone(input, region as 'ZA' | 'US' | 'GB' | null)).toBe(expected);
  });

  it('requires an international number when no region is known', () => {
    expect(tryNormalizePhone('0821234567')).toBeNull();
    expect(tryNormalizePhone('0821234567', null)).toBeNull();
  });
});
