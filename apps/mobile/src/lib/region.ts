/**
 * Where the owner is, read from the device, so a new business starts with its
 * own timezone and currency instead of a country default. Pure: the device
 * values are passed in (see `readDeviceLocale` in device-locale.ts).
 */
export interface DeviceLocaleInput {
  timeZone?: string | null;
  currencyCode?: string | null;
  regionCode?: string | null;
}

export interface LocaleDefaults {
  timezone: string;
  currency: string;
  /** ISO 3166 country, or null when the device does not say */
  region: string | null;
}

export const FALLBACK_TIMEZONE = 'UTC';
export const FALLBACK_CURRENCY = 'USD';

// The country's own currency, for devices that report a region but no currency.
const REGION_CURRENCY: Record<string, string> = {
  ZA: 'ZAR',
  US: 'USD',
  GB: 'GBP',
  AU: 'AUD',
  CA: 'CAD',
  NZ: 'NZD',
  KE: 'KES',
  NG: 'NGN',
  BW: 'BWP',
  NA: 'NAD',
  IN: 'INR',
  AE: 'AED',
  SG: 'SGD',
  BR: 'BRL',
  MX: 'MXN',
  IE: 'EUR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
};

// Currencies used by a single country: a business in that currency is in that country.
const CURRENCY_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_CURRENCY)
    .filter(([, c]) => c !== 'EUR')
    .map(([r, c]) => [c, r]),
);

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Timezone, currency and country for a business created from this device. */
export function localeDefaults(device: DeviceLocaleInput): LocaleDefaults {
  const zone = device.timeZone?.trim();
  const region = /^[A-Za-z]{2}$/.test(device.regionCode ?? '')
    ? device.regionCode!.toUpperCase()
    : null;
  const code = device.currencyCode?.trim().toUpperCase();
  const currency =
    code && /^[A-Z]{3}$/.test(code)
      ? code
      : ((region && REGION_CURRENCY[region]) ?? FALLBACK_CURRENCY);
  return {
    timezone: zone && isValidTimeZone(zone) ? zone : FALLBACK_TIMEZONE,
    currency,
    region,
  };
}

/**
 * The business's country: its currency when that names one country, else the
 * device's. Null when neither does (phone hints then stay generic).
 */
export function businessRegion(
  currency: string | null | undefined,
  deviceRegion: string | null | undefined,
): string | null {
  const byCurrency = currency
    ? CURRENCY_REGION[currency.toUpperCase()]
    : undefined;
  return byCurrency ?? deviceRegion?.toUpperCase() ?? null;
}

// Example mobile numbers per country (libphonenumber's published examples), shown as input hints.
const PHONE_EXAMPLES: Record<string, string> = {
  ZA: '+27 71 123 4567',
  US: '+1 201 555 0123',
  GB: '+44 7400 123456',
  AU: '+61 412 345 678',
  CA: '+1 506 234 5678',
  NZ: '+64 21 123 4567',
  IE: '+353 85 012 3456',
  DE: '+49 1512 3456789',
  FR: '+33 6 12 34 56 78',
  ES: '+34 612 34 56 78',
  IT: '+39 312 345 6789',
  NL: '+31 6 12345678',
  IN: '+91 81234 56789',
  KE: '+254 712 123456',
  NG: '+234 802 123 4567',
  BW: '+267 71 234 567',
  NA: '+264 81 123 4567',
  AE: '+971 50 123 4567',
  SG: '+65 8123 4567',
  BR: '+55 11 91234 5678',
  MX: '+52 222 123 4567',
};

/** An example mobile number for the country, or null when we have none (use the generic hint). */
export function examplePhone(region: string | null | undefined): string | null {
  return (region && PHONE_EXAMPLES[region.toUpperCase()]) || null;
}

const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'ZAR',
  'BWP',
  'NAD',
  'KES',
  'NGN',
  'INR',
];

/** Currencies to pick from: the business's own and the device's first, then the common ones. No duplicates. */
export function currencyChoices(
  current: string | null | undefined,
  device: string | null | undefined,
): string[] {
  const own = [current, device].filter((c): c is string => Boolean(c));
  return [...new Set([...own, ...COMMON_CURRENCIES])];
}
