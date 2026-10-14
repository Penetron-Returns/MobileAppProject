/**
 * Flow tokens: `v1.<conversationId>.<subject>.<expiry>.<hmac>`
 *
 * subject = `<attemptId>` for a booking flow, `rs-<appointmentId>` for a
 * reschedule flow. expiry = unix seconds. hmac = HMAC-SHA256(FLOW_TOKEN_SECRET)
 * over everything before the last dot, hex.
 */
import { hmacSha256Hex, safeEqual } from '../../lib/crypto.ts';
import { isUuid } from '../ids.ts';

export const FLOW_TOKEN_TTL_SECONDS = 24 * 3600;

export interface FlowTokenClaims {
  conversationId: string;
  kind: 'booking' | 'reschedule';
  attemptId: string | null;
  appointmentId: string | null;
  expiresAt: number;
}

export function signFlowToken(
  secret: string,
  input: { conversationId: string; subject: string; now: Date; ttlSeconds?: number },
): string {
  const exp = Math.floor(input.now.getTime() / 1000) + (input.ttlSeconds ?? FLOW_TOKEN_TTL_SECONDS);
  const body = `v1.${input.conversationId}.${input.subject}.${exp}`;
  return `${body}.${hmacSha256Hex(secret, body)}`;
}

export type FlowTokenCheck = { ok: true; claims: FlowTokenClaims } | { ok: false; reason: 'malformed' | 'signature' | 'expired' };

export function verifyFlowToken(secret: string, token: unknown, now: Date, opts: { allowExpired?: boolean } = {}): FlowTokenCheck {
  if (typeof token !== 'string' || token.length > 300) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') return { ok: false, reason: 'malformed' };
  const [, conversationId, subject, expRaw, mac] = parts as [string, string, string, string, string];
  if (!isUuid(conversationId) || !/^\d{1,12}$/.test(expRaw)) return { ok: false, reason: 'malformed' };

  let kind: FlowTokenClaims['kind'];
  let attemptId: string | null = null;
  let appointmentId: string | null = null;
  if (subject.startsWith('rs-') && isUuid(subject.slice(3))) {
    kind = 'reschedule';
    appointmentId = subject.slice(3).toLowerCase();
  } else if (isUuid(subject)) {
    kind = 'booking';
    attemptId = subject.toLowerCase();
  } else {
    return { ok: false, reason: 'malformed' };
  }

  const expected = hmacSha256Hex(secret, parts.slice(0, 4).join('.'));
  if (!safeEqual(mac, expected)) return { ok: false, reason: 'signature' };
  const expiresAt = Number(expRaw);
  if (!opts.allowExpired && expiresAt * 1000 < now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, claims: { conversationId: conversationId.toLowerCase(), kind, attemptId, appointmentId, expiresAt } };
}
