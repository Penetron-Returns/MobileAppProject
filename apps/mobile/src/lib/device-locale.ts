import { getCalendars, getLocales } from 'expo-localization';

import {
  businessRegion,
  examplePhone,
  localeDefaults,
  type LocaleDefaults,
} from './region';

/** The device's timezone, currency and country (see `localeDefaults` for the fallbacks). */
export function readDeviceLocale(): LocaleDefaults {
  try {
    const locale = getLocales()[0];
    return localeDefaults({
      timeZone: getCalendars()[0]?.timeZone,
      currencyCode: locale?.currencyCode,
      regionCode: locale?.regionCode,
    });
  } catch {
    return localeDefaults({});
  }
}

/** An example mobile number for this business's country, or null when unknown (show the generic hint). */
export function phoneExampleFor(currency: string): string | null {
  return examplePhone(businessRegion(currency, readDeviceLocale().region));
}
