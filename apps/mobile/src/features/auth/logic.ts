/** Pure helpers for the sign-in / sign-up flow (no Clerk, no React). */

export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 30;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

export const isValidEmail = (raw: string) =>
  EMAIL_PATTERN.test(normalizeEmail(raw));

export type CodeStrategy = 'email_code' | 'phone_code';

export type Identifier =
  | { strategy: 'email_code'; value: string }
  | { strategy: 'phone_code'; value: string };

/** E.164: "+", then 8 to 15 digits, no leading zero. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/** Phone numbers as people type them: spaces, dashes, dots and brackets are fine; "00" means "+". */
export function normalizePhone(raw: string): string {
  const compact = raw.trim().replace(/[\s().-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export const isValidPhone = (raw: string) =>
  E164_PATTERN.test(normalizePhone(raw));

/**
 * What the sign-in field holds: an email (code by email) or a phone number
 * in international format (code by SMS), or null when it is neither.
 */
export function parseIdentifier(raw: string): Identifier | null {
  if (isValidEmail(raw)) {
    return { strategy: 'email_code', value: normalizeEmail(raw) };
  }
  if (isValidPhone(raw)) {
    return { strategy: 'phone_code', value: normalizePhone(raw) };
  }
  return null;
}

/** Keeps digits only and caps at the code length (paste, autofill, typing). */
export function sanitizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export const isCodeComplete = (code: string) => code.length === CODE_LENGTH;

/** Whole seconds until the resend button unlocks; 0 once it is available. */
export function resendSecondsLeft(resendAt: number | null, now: number) {
  if (resendAt == null) return 0;
  return Math.max(0, Math.ceil((resendAt - now) / 1000));
}

/** Splits a code into one entry per cell, padded with empty strings. */
export function codeCells(code: string): string[] {
  return Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
}
