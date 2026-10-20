/**
 * Phone normalisation to E.164. Numbers without a country code are read in the
 * business's country (see region.ts); with no region known, a number must start with + or 00. Matches the `clients.phone_e164` check constraint
 * `^\+[1-9][0-9]{6,14}$`.
 */
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

import { AppError } from './errors.ts';

/** The business's country, or null when unknown. */
export type PhoneRegion = CountryCode | null;

const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Returns the E.164 form, or null when the input is not a valid number. */
export function tryNormalizePhone(input: string, region: PhoneRegion = null): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 32) return null;
  // "00" international prefix → "+"
  const candidate = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, region ?? undefined);
  if (!parsed || !parsed.isValid()) return null;
  const e164 = parsed.number;
  return E164_RE.test(e164) ? e164 : null;
}

/** Normalises or throws VALIDATION_FAILED (the message never echoes the number). */
export function normalizePhone(input: string, region: PhoneRegion = null): string {
  const e164 = tryNormalizePhone(input, region);
  if (!e164) throw new AppError('VALIDATION_FAILED', 'Invalid phone number', { field: 'phone' });
  return e164;
}
