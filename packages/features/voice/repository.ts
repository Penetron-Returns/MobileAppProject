/** Supabase implementation of DeviceTokenRepository. Service role: every query is scoped by business and user. */
import type { MemberRole } from '@booking/types';
import type { Db } from '../lib/db.ts';
import { check, maybe } from '../repositories/dbResult.ts';
import type { DeviceTokenRepository, DeviceTokenRow } from './ports.ts';

export function createSupabaseDeviceTokenRepository(db: Db): DeviceTokenRepository {
  return {
    async insert({ businessId, userId, tokenHash, deviceLabel, at }) {
      check(
        await db.from('voice_device_tokens').insert({
          business_id: businessId,
          user_id: userId,
          token_hash: tokenHash,
          device_label: deviceLabel,
          created_at: at.toISOString(),
        }),
      );
    },
    async revokeDevice({ businessId, userId, deviceLabel }, at) {
      check(
        await db
          .from('voice_device_tokens')
          .update({ revoked_at: at.toISOString() })
          .eq('business_id', businessId)
          .eq('user_id', userId)
          .eq('device_label', deviceLabel)
          .is('revoked_at', null),
      );
    },
    async revokeAll({ businessId, userId }, at) {
      check(
        await db
          .from('voice_device_tokens')
          .update({ revoked_at: at.toISOString() })
          .eq('business_id', businessId)
          .eq('user_id', userId)
          .is('revoked_at', null),
      );
    },
    async findByHash(tokenHash) {
      return maybe<DeviceTokenRow>(
        await db.from('voice_device_tokens').select('id, business_id, user_id, revoked_at').eq('token_hash', tokenHash).maybeSingle(),
      );
    },
    async findMember({ businessId, userId }) {
      const [user, business] = await Promise.all([
        db.from('users').select('role').eq('id', userId).eq('business_id', businessId).maybeSingle(),
        db.from('businesses').select('clerk_org_id').eq('id', businessId).maybeSingle(),
      ]);
      const member = maybe<{ role: MemberRole }>(user);
      const org = maybe<{ clerk_org_id: string }>(business);
      return member && org ? { role: member.role, orgId: org.clerk_org_id } : null;
    },
    async touch(id, at) {
      check(await db.from('voice_device_tokens').update({ last_used_at: at.toISOString() }).eq('id', id));
    },
  };
}
