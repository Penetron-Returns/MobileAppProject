/**
 * The country a business operates in, inferred from its timezone and currency (no country column exists).
 * Used to read phone numbers typed without a country code. Pure: unknown input gives null, never a guess.
 */
import type { CountryCode } from 'libphonenumber-js';

const ZONE_REGIONS: Record<string, CountryCode> = {
  'Africa/Johannesburg': 'ZA',
  'Africa/Nairobi': 'KE',
  'Africa/Lagos': 'NG',
  'Africa/Gaborone': 'BW',
  'Africa/Windhoek': 'NA',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Asia/Kolkata': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Singapore': 'SG',
  'America/Sao_Paulo': 'BR',
  'America/Mexico_City': 'MX',
  'Pacific/Auckland': 'NZ',
  'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/Regina': 'CA',
  'America/St_Johns': 'CA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'America/Detroit': 'US',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU',
  'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU',
};

// Only currencies used by one country; EUR is shared, so it is left to the timezone.
const CURRENCY_REGIONS: Record<string, CountryCode> = {
  ZAR: 'ZA',
  USD: 'US',
  GBP: 'GB',
  AUD: 'AU',
  CAD: 'CA',
  NZD: 'NZ',
  KES: 'KE',
  NGN: 'NG',
  BWP: 'BW',
  NAD: 'NA',
  INR: 'IN',
  AED: 'AE',
  SGD: 'SG',
  BRL: 'BR',
  MXN: 'MX',
};

export interface BusinessLocale {
  timezone?: string | null;
  currency?: string | null;
}

/** Timezone first (it names a place), then currency. Null when neither identifies one country. */
export function regionForBusiness(business: BusinessLocale): CountryCode | null {
  const byZone = business.timezone ? ZONE_REGIONS[business.timezone] : undefined;
  if (byZone) return byZone;
  const byCurrency = business.currency ? CURRENCY_REGIONS[business.currency.toUpperCase()] : undefined;
  return byCurrency ?? null;
}

/** The slice of a repository the region lookup needs. */
export interface BusinessLocaleReader {
  getBusiness(businessId: string): Promise<BusinessLocale | null>;
}

/** The business's country for phone parsing; null when the business or its country is unknown. */
export async function businessPhoneRegion(repo: BusinessLocaleReader, businessId: string): Promise<CountryCode | null> {
  const business = await repo.getBusiness(businessId);
  return business ? regionForBusiness(business) : null;
}
