/** In-memory DeviceTokenRepository honouring the real contract (hash-only storage, revocation, membership). */
import type { MemberRole } from '@booking/types';
import type { DeviceTokenOwner, DeviceTokenRepository, DeviceTokenRow } from '@booking/features/voice/ports.ts';

export interface MemoryTokenRecord extends DeviceTokenRow {
  token_hash: string;
  device_label: string;
  created_at: string;
  last_used_at: string | null;
}

export interface MemoryDeviceTokenRepository extends DeviceTokenRepository {
  records: MemoryTokenRecord[];
  /** Registers a business member the tokens may authenticate as. */
  addMember(member: DeviceTokenOwner & { orgId: string; role: MemberRole }): void;
  removeMember(owner: DeviceTokenOwner): void;
}

export function createMemoryDeviceTokenRepository(): MemoryDeviceTokenRepository {
  const records: MemoryTokenRecord[] = [];
  const members = new Map<string, { role: MemberRole; orgId: string }>();
  const key = (o: DeviceTokenOwner) => `${o.businessId}|${o.userId}`;
  let seq = 0;
  return {
    records,
    addMember: ({ orgId, role, ...owner }) => void members.set(key(owner), { role, orgId }),
    removeMember: (owner) => void members.delete(key(owner)),
    async insert({ businessId, userId, tokenHash, deviceLabel, at }) {
      seq += 1;
      records.push({
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        business_id: businessId,
        user_id: userId,
        token_hash: tokenHash,
        device_label: deviceLabel,
        created_at: at.toISOString(),
        last_used_at: null,
        revoked_at: null,
      });
    },
    async revokeDevice({ businessId, userId, deviceLabel }, at) {
      for (const r of records) {
        if (r.business_id === businessId && r.user_id === userId && r.device_label === deviceLabel && !r.revoked_at) r.revoked_at = at.toISOString();
      }
    },
    async revokeAll({ businessId, userId }, at) {
      for (const r of records) {
        if (r.business_id === businessId && r.user_id === userId && !r.revoked_at) r.revoked_at = at.toISOString();
      }
    },
    async findByHash(tokenHash) {
      const r = records.find((x) => x.token_hash === tokenHash);
      return r ? { id: r.id, business_id: r.business_id, user_id: r.user_id, revoked_at: r.revoked_at } : null;
    },
    async findMember(owner) {
      return members.get(key(owner)) ?? null;
    },
    async touch(id, at) {
      const r = records.find((x) => x.id === id);
      if (r) r.last_used_at = at.toISOString();
    },
  };
}
