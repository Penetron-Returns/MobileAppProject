/**
 * Nerova REST client port: the only way the API talks to Nerova (owner chat sessions, account lookup, setup
 * status, outcome counts). The fetch implementation is in `httpClient.ts`, wired in `apps/api/src/container.ts`;
 * tests use the fake in `packages/testing`. Implementations throw `AppError` only
 * (`UPSTREAM_COMPANION_ERROR`, or `COMPANION_NOT_READY` when the client is not configured) and never put the
 * API key in a message or detail.
 */
import type { CompanionColorMode, CompanionOutcomesDTO, CompanionSettingsDTO } from '@booking/types';

export interface NerovaAccount {
  /** Nerova's `acct_` id */
  id: string;
  /** `ready` once the connector import has finished provisioning the account */
  provisioningState: string | null;
}

export interface NerovaSetupStatus {
  /** connect_booking_system | verify_booking_connection | provision_account | connect_whatsapp | go_live | none */
  nextStep: string | null;
  whatsapp: {
    connected: boolean;
    /** Nerova's WhatsAppOnboardingState, passed through */
    state: string;
    displayPhoneNumber: string | null;
    businessVerified: boolean;
  };
  /** The receptionist (companion) is live on WhatsApp */
  receptionistLive: boolean;
  /** Activation version (int64): the `expectedVersion` of the next activation command; null when Nerova omits it */
  version: number | null;
}

export interface CreateConnectionSessionInput {
  accountId: string;
  /** Exact https origin of the embedding page; must be on the Nerova embed allowlist */
  embedOrigin: string;
  expectedVersion: number;
  /** Where Nerova sends the owner back after connecting (already allowlisted by us); omitted unless NEROVA_WHATSAPP_RETURN_URL is on */
  returnUrl?: string | undefined;
  /** Registered nativeApps appId, sent together with returnUrl */
  appId?: string | undefined;
  /** 8 to 255 characters, derived from the logical command so a retry replays the same session */
  idempotencyKey: string;
}

export interface NerovaConnectionSession {
  /** Hosted WhatsApp connect page. Carries `#state=` (a secret): pass it through untouched, never log it. */
  launchUrl: string;
  /** ISO-8601 instant (about 10 minutes out) */
  expiresAt: string;
}

export interface CreateOwnerChatSessionInput {
  /** `acct_` id (an externalReference is also accepted by Nerova) */
  accountId: string;
  /** Web sessions: must be on the Nerova embed allowlist. Omitted for native sessions. */
  origin?: string | undefined;
  /** Native sessions: sent as platform "native" + appId (the app must be registered under nativeApps), with no origin */
  native?: { appId: string } | undefined;
  /** Stable owner id, at most 200 characters, never an email */
  ownerReference: string;
  colorMode: CompanionColorMode;
  /** 8 to 128 characters, derived from the logical command so a retry replays the same session */
  idempotencyKey: string;
}

export interface NerovaOwnerChatSession {
  url: string;
  /** Native sessions only: Nerova's session id */
  sessionId?: string | undefined;
  /** Native sessions only: a secret, never log it */
  state?: string | undefined;
  /** ISO-8601 instant */
  expiresAt: string;
}

export interface TranscribeFile {
  data: Blob;
  filename: string;
  contentType: string;
}

export interface TranscribeOptions {
  language?: string | undefined;
  /** Comma-separated spelling hints (client first names): at most 50 terms of 40 characters, 4096 in all. Sent as the `vocabulary` field. */
  vocabulary?: string | undefined;
}

export interface NerovaTranscription {
  text: string;
  durationMs: number;
  language: string | null;
  /** From Nerova's `Server-Timing` header (ms); null for an entry it did not send. */
  timing?: { providerMs: number | null; totalMs: number | null };
}

/** Partial update of the companion settings (at least one field) */
export type CompanionSettingsPatch = Partial<Pick<CompanionSettingsDTO, 'approvalPolicy' | 'undoWindowSeconds'>>;

export interface NerovaClient {
  /** The account for an `acct_` id or our externalReference (the business id); null when Nerova has none (404). */
  getAccount(idOrReference: string): Promise<NerovaAccount | null>;
  /** Null when the account is unknown (404) */
  getCompanionSetup(idOrReference: string): Promise<NerovaSetupStatus | null>;
  /**
   * Starts a hosted WhatsApp connect session. Throws COMPANION_NOT_READY for an unprovisioned account, and an
   * UPSTREAM_COMPANION_ERROR with `details.nerova_code: "activation.version_conflict"` (HTTP 409) when `expectedVersion` is stale.
   */
  createConnectionSession(input: CreateConnectionSessionInput): Promise<NerovaConnectionSession>;
  createOwnerChatSession(input: CreateOwnerChatSessionInput): Promise<NerovaOwnerChatSession>;
  /**
   * Speech-to-text for one short clip. `language` is omitted unless given (Nerova then auto-detects); `vocabulary` likewise. Throws AppError:
   * VALIDATION_FAILED (400), PAYLOAD_TOO_LARGE (413), UNSUPPORTED_MEDIA_TYPE (415), RATE_LIMITED (429, `details.retry_after_s`),
   * TRANSCRIPTION_UNAVAILABLE (404: not deployed), UPSTREAM_COMPANION_ERROR (402, 403, 5xx, timeout, network; `details.reason`).
   * Never logs the audio or the transcript.
   */
  transcribe(accountId: string, file: TranscribeFile, opts?: TranscribeOptions): Promise<NerovaTranscription>;
  /** `GET /v1/accounts/{id}/companion/settings`. Null when the account is unknown (404). */
  getCompanionSettings(idOrReference: string): Promise<CompanionSettingsDTO | null>;
  /** `PATCH` (partial), the Idempotency-Key forwarded. 400 `settings.invalid` is VALIDATION_FAILED with `details.nerova_code`. */
  updateCompanionSettings(idOrReference: string, patch: CompanionSettingsPatch, idempotencyKey: string): Promise<CompanionSettingsDTO>;
  /** Outcome counts for one UTC calendar month (`month` 1-12) */
  getOutcomeSummary(idOrReference: string, period: { year: number; month: number }): Promise<CompanionOutcomesDTO>;
}
