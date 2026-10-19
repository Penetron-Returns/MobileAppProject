import {
  businessRegion,
  currencyChoices,
  examplePhone,
  localeDefaults,
} from '@/lib/region';

describe('localeDefaults', () => {
  it.each([
    [
      {
        timeZone: 'Africa/Johannesburg',
        currencyCode: 'ZAR',
        regionCode: 'ZA',
      },
      { timezone: 'Africa/Johannesburg', currency: 'ZAR', region: 'ZA' },
    ],
    [
      { timeZone: 'America/New_York', currencyCode: 'USD', regionCode: 'US' },
      { timezone: 'America/New_York', currency: 'USD', region: 'US' },
    ],
    [
      { timeZone: 'Europe/London', currencyCode: 'GBP', regionCode: 'GB' },
      { timezone: 'Europe/London', currency: 'GBP', region: 'GB' },
    ],
    [
      { timeZone: 'Europe/Berlin', currencyCode: null, regionCode: 'de' },
      { timezone: 'Europe/Berlin', currency: 'EUR', region: 'DE' },
    ],
    [
      { timeZone: 'Mars/Base', currencyCode: 'usd', regionCode: null },
      { timezone: 'UTC', currency: 'USD', region: null },
    ],
    [{}, { timezone: 'UTC', currency: 'USD', region: null }],
    [
      { timeZone: null, currencyCode: 'dollars', regionCode: 'XX' },
      { timezone: 'UTC', currency: 'USD', region: 'XX' },
    ],
  ])('reads %j', (device, expected) => {
    expect(localeDefaults(device)).toEqual(expected);
  });
});

describe('businessRegion', () => {
  it.each([
    ['ZAR', 'US', 'ZA'],
    ['USD', null, 'US'],
    ['GBP', 'ZA', 'GB'],
    ['EUR', 'DE', 'DE'],
    ['EUR', null, null],
    [undefined, 'fr', 'FR'],
    [null, null, null],
  ])('%s with device region %s is %s', (currency, device, expected) => {
    expect(businessRegion(currency, device)).toBe(expected);
  });
});

describe('examplePhone', () => {
  it.each([
    ['ZA', '+27 71 123 4567'],
    ['us', '+1 201 555 0123'],
    ['GB', '+44 7400 123456'],
    ['ZZ', null],
    [null, null],
    [undefined, null],
  ])('%s gives %s', (region, expected) => {
    expect(examplePhone(region)).toBe(expected);
  });

  it('never shows the +27 example to a US business', () => {
    expect(examplePhone(businessRegion('USD', 'US'))).not.toContain('+27');
  });
});

describe('currencyChoices', () => {
  it('lists the business and device currencies first, once each', () => {
    const list = currencyChoices('ZAR', 'USD');
    expect(list.slice(0, 2)).toEqual(['ZAR', 'USD']);
    expect(new Set(list).size).toBe(list.length);
  });

  it('keeps an uncommon current currency selectable', () => {
    expect(currencyChoices('CHF', undefined)[0]).toBe('CHF');
  });

  it('puts the device currency first for a new business', () => {
    expect(currencyChoices(undefined, 'GBP')[0]).toBe('GBP');
  });
});
