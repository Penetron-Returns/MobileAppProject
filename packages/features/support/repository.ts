import type { Json } from '@booking/database';
import type { Db } from '../lib/db.ts';
import { AppError } from '../lib/errors.ts';
import type { SupportRequestRow, SupportRequestsRepository } from './ports.ts';

const COLS = 'id, business_id, nerova_account_id, status, created_at, resolved_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (error: { message: string }): never => {
  throw new AppError('INTERNAL', 'Support request storage failed', { reason: error.message });
};

/** Service-role repository; every query is scoped by business_id (or by the account id mapped to one). */
export function createSupabaseSupportRepository(db: Db): SupportRequestsRepository {
  return {
    async findBusinessId({ accountId, externalReference }) {
      const byAccount = await db.from('businesses').select('id').eq('nerova_account_id', accountId).maybeSingle();
      if (byAccount.error) return fail(byAccount.error);
      if (byAccount.data) return byAccount.data.id;
      if (!externalReference || !UUID_RE.test(externalReference)) return null;
      const byRef = await db.from('businesses').select('id').eq('id', externalReference).maybeSingle();
      if (byRef.error) return fail(byRef.error);
      return byRef.data?.id ?? null;
    },
    async listOwnerIds(businessId) {
      const { data, error } = await db.from('users').select('id').eq('business_id', businessId).eq('role', 'owner');
      if (error) return fail(error);
      return (data ?? []).map((u) => u.id);
    },
    async getBusinessName(businessId) {
      const { data, error } = await db.from('businesses').select('name').eq('id', businessId).maybeSingle();
      if (error) return fail(error);
      return data?.name ?? null;
    },
    async open(input) {
      const { data, error } = await db
        .from('support_requests')
        .insert({ business_id: input.businessId, nerova_account_id: input.nerovaAccountId, summary: input.summary, health: input.health as Json })
        .select(COLS)
        .single();
      if (error) return fail(error);
      return data as SupportRequestRow;
    },
    async resolveOpen({ businessId, nerovaAccountId, nowIso }) {
      const { data, error } = await db
        .from('support_requests')
        .update({ status: 'resolved', resolved_at: nowIso })
        .eq('business_id', businessId)
        .eq('nerova_account_id', nerovaAccountId)
        .eq('status', 'open')
        .select('id');
      if (error) return fail(error);
      return data?.length ?? 0;
    },
  };
}
