/**
 * Inbound Standard Webhooks verification (Nerova deliveries). The mirror of `signStandardWebhook`: the same
 * HMAC input, checked against every `v1,` signature in the header (a rotated secret signs twice for 24 hours),
 * compared in constant time, with a five minute timestamp tolerance in both directions.
 */
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

import { signStandardWebhook } from '../events/events.ts';

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface StandardWebhookHeaders {
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
}

export type WebhookVerification = { ok: true } | { ok: false; reason: 'missing_headers' | 'bad_timestamp' | 'stale_timestamp' | 'bad_signature' };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Verifies the raw body (never a re-serialised one) against the delivery headers. */
export function verifyStandardWebhook(
  secret: string,
  rawBody: string,
  headers: StandardWebhookHeaders,
  now: Date = new Date(),
): WebhookVerification {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };
  const seconds = Number(timestamp);
  if (Math.abs(Math.floor(now.getTime() / 1000) - seconds) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' };

  const expected = signStandardWebhook(secret, id, seconds, rawBody);
  // Check every candidate (no early exit) so timing does not reveal which one matched.
  let matched = false;
  for (const candidate of signature.split(' ')) {
    if (candidate.startsWith('v1,') && safeEqual(candidate, expected)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: 'bad_signature' };
}
