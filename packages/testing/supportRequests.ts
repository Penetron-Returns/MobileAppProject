/** In-memory SupportRequestsRepository: businesses by Nerova account id, recorded rows. */
import type { NewSupportRequest, SupportRequestRow, SupportRequestsRepository } from '@booking/features/support/ports.ts';

export interface StoredSupportRequest extends SupportRequestRow {
  summary: string;
  health: object;
}

export interface FakeSupportRepository extends SupportRequestsRepository {
  rows: StoredSupportRequest[];
}

export function createFakeSupportRepository(options: {
  /** acct_ id -> business id */
  accounts?: Record<string, string>;
  ownerIds?: Record<string, string[]>;
  clock?: () => Date;
} = {}): FakeSupportRepository {
  const accounts = options.accounts ?? {};
  const clock = options.clock ?? (() => new Date());
  let seq = 0;
  const fake: FakeSupportRepository = {
    rows: [],
    async findBusinessId({ accountId }) {
      return accounts[accountId] ?? null;
    },
    async listOwnerIds(businessId) {
      return options.ownerIds?.[businessId] ?? [];
    },
    async open(input: NewSupportRequest) {
      seq += 1;
      const row: StoredSupportRequest = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        business_id: input.businessId,
        nerova_account_id: input.nerovaAccountId,
        status: 'open',
        created_at: clock().toISOString(),
        resolved_at: null,
        summary: input.summary,
        health: input.health,
      };
      fake.rows.push(row);
      return row;
    },
    async resolveOpen({ businessId, nerovaAccountId, nowIso }) {
      const open = fake.rows.filter((r) => r.business_id === businessId && r.nerova_account_id === nerovaAccountId && r.status === 'open');
      for (const r of open) Object.assign(r, { status: 'resolved', resolved_at: nowIso });
      return open.length;
    },
  };
  return fake;
}
