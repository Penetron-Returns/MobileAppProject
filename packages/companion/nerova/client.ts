/**
 * Nerova REST client port: the only way the API talks to Nerova (owner chat sessions, account lookup, setup
 * status, outcome counts). The fetch implementation is in `httpClient.ts`, wired in `apps/api/src/container.ts`;
 * tests use the fake in `packages/testing`. Implementations throw `AppError` only
 * (`UPSTREAM_COMPANION_ERROR`, or `COMPANION_NOT_READY` when the client is not configured) and never put the
 * API key in a message or detail.
 */
import type { CompanionColorMode, CompanionOutcomesDTO } from '@booking/types';

export interface NerovaAccount {
  /** Nerova's `acct_` id */
  id: string;
  /** `ready` once the connector import has finished provisioning the account */
  provisioningState: string | null;
}

export interface NerovaSetupStatus {
  /** connect_booking_system | verify_booking_connection | provision_account | connect_whatsapp | go_live | none */
  nextStep: string | null;
}

export interface CreateOwnerChatSessionInput {
  /** `acct_` id (an externalReference is also accepted by Nerova) */
  accountId: string;
  /** Must be on the Nerova embed allowlist */
  origin: string;
  /** Stable owner id, at most 200 characters, never an email */
  ownerReference: string;
  colorMode: CompanionColorMode;
  /** 8 to 128 characters, derived from the logical command so a retry replays the same session */
  idempotencyKey: string;
}

export interface NerovaOwnerChatSession {
  url: string;
  /** ISO-8601 instant */
  expiresAt: string;
}

export interface NerovaClient {
  /** The account for an `acct_` id or our externalReference (the business id); null when Nerova has none (404). */
  getAccount(idOrReference: string): Promise<NerovaAccount | null>;
  /** Null when the account is unknown (404) */
  getCompanionSetup(idOrReference: string): Promise<NerovaSetupStatus | null>;
  createOwnerChatSession(input: CreateOwnerChatSessionInput): Promise<NerovaOwnerChatSession>;
  /** Outcome counts for one UTC calendar month (`month` 1-12) */
  getOutcomeSummary(idOrReference: string, period: { year: number; month: number }): Promise<CompanionOutcomesDTO>;
}
