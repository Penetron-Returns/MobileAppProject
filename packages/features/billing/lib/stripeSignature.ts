/** Stripe-Signature verification: `t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">[,v1=...]`. Check the RAW body before parsing. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const STRIPE_TOLERANCE_SECONDS = 300;

export type SignatureVerdict = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

export function verifyStripeSignature(secret: string, rawBody: string, header: string | undefined | null, now: Date): SignatureVerdict {
  if (!header) return { ok: false, reason: 'missing' };
  let timestamp: number | null = null;
  const candidates: string[] = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = Number(value);
    if (key === 'v1') candidates.push(value);
  }
  if (timestamp === null || !Number.isInteger(timestamp) || candidates.length === 0) return { ok: false, reason: 'malformed' };
  if (Math.abs(now.getTime() / 1000 - timestamp) > STRIPE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const matches = candidates.some((hex) => {
    const given = Buffer.from(hex, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return matches ? { ok: true } : { ok: false, reason: 'mismatch' };
}

/** The header Stripe would send; used by tests and as documentation of the scheme. */
export function signStripePayload(secret: string, rawBody: string, timestampSeconds: number): string {
  const digest = createHmac('sha256', secret).update(`${timestampSeconds}.${rawBody}`).digest('hex');
  return `t=${timestampSeconds},v1=${digest}`;
}
