/** Pure helpers for the sign-in / sign-up flow (no Clerk, no React). */

export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 30;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

export const isValidEmail = (raw: string) =>
  EMAIL_PATTERN.test(normalizeEmail(raw));

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
