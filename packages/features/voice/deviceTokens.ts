/**
 * Device voice tokens: opaque `cvt_` credentials that let the phone upload a voice clip or answer an
 * attendance check while the app is backgrounded and no Clerk session token exists. Only the SHA-256
 * hash is stored; the token itself is returned once and never logged.
 */
import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/crypto.ts';
import type { DeviceTokenIdentity, DeviceTokenRepository, DeviceTokenService } from './ports.ts';

export const DEVICE_TOKEN_PREFIX = 'cvt_';
export const DEFAULT_DEVICE_LABEL = 'default';
/** 4 + 43 base64url chars; anything longer is rejected before hashing. */
const MAX_TOKEN_LENGTH = 64;

/**
 * A verified token is trusted in-isolate for this long, so a request costs no database round trip. This is the
 * revocation latency: a token revoked, rotated or whose member was removed in ANOTHER isolate keeps working here for
 * up to this long (the same isolate forgets it at once, see `revoke` and `mint`).
 */
export const AUTH_CACHE_TTL_MS = 60_000;
/** `last_used_at` is bookkeeping only: written at most this often per token. */
export const TOUCH_INTERVAL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 500;

export function isDeviceToken(value: string): boolean {
  return value.startsWith(DEVICE_TOKEN_PREFIX);
}

export function hashDeviceToken(token: string): string {
  return sha256Hex(token);
}

export function generateDeviceToken(): string {
  return `${DEVICE_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function createDeviceTokenService(deps: {
  repo: DeviceTokenRepository;
  clock?: () => Date;
  generate?: () => string;
  /** Runs a bookkeeping task off the request path (must not throw). Default: started and left to settle. */
  defer?: (task: () => Promise<unknown>) => void;
  authCacheTtlMs?: number;
  touchIntervalMs?: number;
}): DeviceTokenService {
  const { repo } = deps;
  const clock = deps.clock ?? (() => new Date());
  const generate = deps.generate ?? generateDeviceToken;
  const defer = deps.defer ?? ((task) => void task().catch(() => undefined));
  const cacheTtlMs = deps.authCacheTtlMs ?? AUTH_CACHE_TTL_MS;
  const touchIntervalMs = deps.touchIntervalMs ?? TOUCH_INTERVAL_MS;

  // Keyed by the SHA-256 of the token (never the token), so one token can never read another's entry.
  const verified = new Map<string, { identity: DeviceTokenIdentity; expiresAt: number }>();
  const lastTouched = new Map<string, number>();

  const forget = (owner: { businessId: string; userId: string }) => {
    for (const [key, entry] of verified) {
      if (entry.identity.businessId === owner.businessId && entry.identity.userId === owner.userId) verified.delete(key);
    }
  };
  const remember = (key: string, identity: DeviceTokenIdentity, now: number) => {
    verified.delete(key);
    verified.set(key, { identity, expiresAt: now + cacheTtlMs });
    while (verified.size > MAX_CACHE_ENTRIES) {
      const oldest = verified.keys().next().value;
      if (oldest === undefined) break;
      verified.delete(oldest);
    }
  };
  const touchIfDue = (rowId: string, now: number) => {
    const last = lastTouched.get(rowId);
    if (last !== undefined && now - last < touchIntervalMs) return;
    lastTouched.delete(rowId);
    lastTouched.set(rowId, now);
    if (lastTouched.size > MAX_CACHE_ENTRIES) lastTouched.delete(lastTouched.keys().next().value as string);
    defer(() => repo.touch(rowId, new Date(now)));
  };

  return {
    async mint({ businessId, userId, deviceLabel }) {
      const label = deviceLabel?.trim() || DEFAULT_DEVICE_LABEL;
      const token = generate();
      const at = clock();
      forget({ businessId, userId });
      await repo.revokeDevice({ businessId, userId, deviceLabel: label }, at);
      await repo.insert({ businessId, userId, tokenHash: hashDeviceToken(token), deviceLabel: label, at });
      return token;
    },
    async revoke(owner) {
      forget(owner);
      await repo.revokeAll(owner, clock());
    },
    async authenticate(token) {
      if (!isDeviceToken(token) || token.length > MAX_TOKEN_LENGTH) return null;
      const key = hashDeviceToken(token);
      const now = clock().getTime();
      const hit = verified.get(key);
      if (hit && hit.expiresAt > now) return hit.identity;
      verified.delete(key);
      // Only successes are cached: a bad, revoked or orphaned token is looked up again every time.
      const row = await repo.findByHash(key);
      if (!row || row.revoked_at) return null;
      const member = await repo.findMember({ businessId: row.business_id, userId: row.user_id });
      if (!member) return null;
      const identity = { userId: row.user_id, businessId: row.business_id, orgId: member.orgId, role: member.role };
      remember(key, identity, now);
      // Best effort and off the request path: a failure must not lock the owner out of check-in.
      touchIfDue(row.id, now);
      return identity;
    },
  };
}
