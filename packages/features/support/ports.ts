/** Support requests raised by the owner through the companion ("talk to a human"). Written by the API only. */
import type { UUID } from '@booking/types';

export interface SupportRequestRow {
  id: UUID;
  business_id: UUID;
  nerova_account_id: string;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

export interface NewSupportRequest {
  businessId: UUID;
  nerovaAccountId: string;
  /** The owner's words as Nerova summarised them: personal data, stored, never logged */
  summary: string;
  /** WhatsApp health snapshot (no message content) */
  health: object;
}

export interface SupportRequestsRepository {
  /** The business for a Nerova account: our cached `nerova_account_id`, else the external reference when it is a business id. Null when none. */
  findBusinessId(input: { accountId: string; externalReference: string | null }): Promise<UUID | null>;
  /** Owner user ids of the business (push targets) */
  listOwnerIds(businessId: UUID): Promise<string[]>;
  open(input: NewSupportRequest): Promise<SupportRequestRow>;
  /** Marks every open request of the business and account resolved; returns how many changed */
  resolveOpen(input: { businessId: UUID; nerovaAccountId: string; nowIso: string }): Promise<number>;
}
