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
  /** The business display name for the support alert email; null when missing */
  getBusinessName(businessId: UUID): Promise<string | null>;
  open(input: NewSupportRequest): Promise<SupportRequestRow>;
  /** Marks every open request of the business and account resolved; returns how many changed */
  resolveOpen(input: { businessId: UUID; nerovaAccountId: string; nowIso: string }): Promise<number>;
}

/** What the support inbox email is built from: ids, enums and the owner's own words; never client PII. */
export interface SupportAlert {
  businessId: UUID;
  businessName: string | null;
  supportRequestId: UUID;
  category: string | null;
  reason: string | null;
  summary: string;
  /** One-line WhatsApp health, e.g. "status restricted, quality red, ..." */
  healthSummary: string;
  raisedAt: string | null;
  escalationId: string | null;
}

/** Emails the Clovie support inbox about a new owner support request. Implementations throw on failure. */
export interface SupportAlertSender {
  send(alert: SupportAlert): Promise<void>;
}
