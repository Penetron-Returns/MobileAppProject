/**
 * Device voice tokens: opaque `cvt_` credentials that let the phone upload a voice clip or answer an
 * attendance check while the app is backgrounded and no Clerk session token exists. Only the SHA-256
 * hash is stored; the token itself is returned once and never logged.
 */
import { randomBytes } from 'node:crypto';

import { sha256Hex } from '../lib/crypto.ts';
import type { DeviceTokenRepository, DeviceTokenService } from './ports.ts';

export const DEVICE_TOKEN_PREFIX = 'cvt_';
export const DEFAULT_DEVICE_LABEL = 'default';
/** 4 + 43 base64url chars; anything longer is rejected before hashing. */
const MAX_TOKEN_LENGTH = 64;

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
}): DeviceTokenService {
  const { repo } = deps;
  const clock = deps.clock ?? (() => new Date());
  const generate = deps.generate ?? generateDeviceToken;
  return {
    async mint({ businessId, userId, deviceLabel }) {
      const label = deviceLabel?.trim() || DEFAULT_DEVICE_LABEL;
      const token = generate();
      const at = clock();
      await repo.revokeDevice({ businessId, userId, deviceLabel: label }, at);
      await repo.insert({ businessId, userId, tokenHash: hashDeviceToken(token), deviceLabel: label, at });
      return token;
    },
    async revoke(owner) {
      await repo.revokeAll(owner, clock());
    },
    async authenticate(token) {
      if (!isDeviceToken(token) || token.length > MAX_TOKEN_LENGTH) return null;
      const row = await repo.findByHash(hashDeviceToken(token));
      if (!row || row.revoked_at) return null;
      // Membership check and last-used bookkeeping are independent, so they run together (one round trip, not two).
      // The bookkeeping write is best effort: a failure must not lock the owner out of check-in.
      const [member] = await Promise.all([
        repo.findMember({ businessId: row.business_id, userId: row.user_id }),
        repo.touch(row.id, clock()).catch(() => undefined),
      ]);
      if (!member) return null;
      return { userId: row.user_id, businessId: row.business_id, orgId: member.orgId, role: member.role };
    },
  };
}
