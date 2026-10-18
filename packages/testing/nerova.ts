/** In-memory NerovaClient: accounts keyed by `acct_` id and externalReference, recorded session requests. */
import type { CompanionOutcomesDTO, CompanionSettingsDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import type {
  CompanionSettingsPatch,
  CreateConnectionSessionInput,
  CreateOwnerChatSessionInput,
  NerovaAccount,
  NerovaClient,
  NerovaConnectionSession,
  NerovaOwnerChatSession,
  NerovaSetupStatus,
  NerovaTranscription,
} from '@booking/companion/nerova/client.ts';

export interface FakeNerovaAccount extends NerovaAccount {
  /** Our business id */
  externalReference: string;
  nextStep?: string | null;
  /** Defaults to not connected */
  whatsapp?: Partial<NerovaSetupStatus['whatsapp']>;
  receptionistLive?: boolean;
  provisioned?: boolean;
  bookingConnection?: string | null;
  blockingReasons?: string[];
  /** Activation version; defaults to 1 */
  activationVersion?: number;
}

export interface FakeTranscriptionRequest {
  accountId: string;
  filename: string;
  contentType: string;
  size: number;
  language: string | undefined;
  /** The `vocabulary` field; absent when none was sent */
  vocabulary?: string;
}

export interface FakeNerovaClient extends NerovaClient {
  /** Every transcribe call (metadata only, never the audio), in order */
  transcriptionRequests: FakeTranscriptionRequest[];
  /** What transcribe returns */
  transcription: NerovaTranscription;
  accounts: FakeNerovaAccount[];
  /** Every createOwnerChatSession input, in order */
  sessionRequests: CreateOwnerChatSessionInput[];
  /** Every createConnectionSession input, in order (including rejected stale ones) */
  connectionSessionRequests: CreateConnectionSessionInput[];
  /** The next N createConnectionSession calls fail with a version conflict and move the activation version on */
  versionConflicts: number;
  outcomes: CompanionOutcomesDTO;
  /** The companion settings every account returns; PATCH merges into it */
  settings: CompanionSettingsDTO;
  /** Every updateCompanionSettings call (account, patch, key), in order */
  settingsUpdates: { accountId: string; patch: CompanionSettingsPatch; idempotencyKey: string }[];
  /** When set, every call throws this (a Nerova outage) */
  failWith: AppError | null;
}

const SESSION_TTL_MS = 15 * 60 * 1000;
const CONNECT_TTL_MS = 10 * 60 * 1000;

export function createFakeNerovaClient(
  options: { accounts?: FakeNerovaAccount[]; outcomes?: CompanionOutcomesDTO; clock?: () => Date } = {},
): FakeNerovaClient {
  const clock = options.clock ?? (() => new Date());
  const fake: FakeNerovaClient = {
    accounts: options.accounts ?? [],
    sessionRequests: [],
    transcriptionRequests: [],
    transcription: { text: 'book me a haircut tomorrow', durationMs: 2300, language: 'en' },
    connectionSessionRequests: [],
    versionConflicts: 0,
    outcomes: options.outcomes ?? { bookings_created: 0, bookings_rescheduled: 0, bookings_cancelled: 0, conversations_handled: 0 },
    failWith: null,
    settings: { approvalPolicy: 'risky_only', undoWindowSeconds: 30, updatedAt: '2026-10-26T08:00:00.000Z' },
    settingsUpdates: [],
    async getCompanionSettings(idOrReference) {
      if (fake.failWith) throw fake.failWith;
      return fake.accounts.some((a) => a.id === idOrReference || a.externalReference === idOrReference) ? { ...fake.settings } : null;
    },
    async updateCompanionSettings(idOrReference, patch, idempotencyKey) {
      if (fake.failWith) throw fake.failWith;
      if (patch.undoWindowSeconds !== undefined && (patch.undoWindowSeconds < 0 || patch.undoWindowSeconds > 120)) {
        throw new AppError('VALIDATION_FAILED', 'The companion settings were rejected', { reason: 'settings.invalid', nerova_code: 'settings.invalid' });
      }
      fake.settingsUpdates.push({ accountId: idOrReference, patch, idempotencyKey });
      fake.settings = { ...fake.settings, ...patch, updatedAt: clock().toISOString() };
      return { ...fake.settings };
    },
    async getAccount(idOrReference) {
      if (fake.failWith) throw fake.failWith;
      const found = fake.accounts.find((a) => a.id === idOrReference || a.externalReference === idOrReference);
      return found ? { id: found.id, provisioningState: found.provisioningState } : null;
    },
    async getCompanionSetup(idOrReference): Promise<NerovaSetupStatus | null> {
      if (fake.failWith) throw fake.failWith;
      const found = fake.accounts.find((a) => a.id === idOrReference || a.externalReference === idOrReference);
      if (!found) return null;
      return {
        nextStep: found.nextStep ?? null,
        whatsapp: { connected: false, state: 'not_connected', displayPhoneNumber: null, businessVerified: false, businessVerificationStatus: null, ...found.whatsapp },
        provisioned: found.provisioned ?? true,
        bookingConnection: found.bookingConnection ?? null,
        blockingReasons: found.blockingReasons ?? [],
        receptionistLive: found.receptionistLive ?? false,
        version: found.activationVersion ?? 1,
      };
    },
    async createConnectionSession(input): Promise<NerovaConnectionSession> {
      if (fake.failWith) throw fake.failWith;
      fake.connectionSessionRequests.push(input);
      const found = fake.accounts.find((a) => a.id === input.accountId);
      if (!found) throw new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service rejected the request', { status: 404 });
      if (fake.versionConflicts > 0 || input.expectedVersion !== (found.activationVersion ?? 1)) {
        if (fake.versionConflicts > 0) {
          fake.versionConflicts -= 1;
          found.activationVersion = (found.activationVersion ?? 1) + 1;
        }
        throw new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service rejected the request', { status: 409, nerova_code: 'activation.version_conflict' });
      }
      return {
        launchUrl: `https://app.nerova.test/connect/whatsapp/pacs_${input.accountId}#state=launch-secret`,
        expiresAt: new Date(clock().getTime() + CONNECT_TTL_MS).toISOString(),
      };
    },
    async createOwnerChatSession(input): Promise<NerovaOwnerChatSession> {
      if (fake.failWith) throw fake.failWith;
      fake.sessionRequests.push(input);
      return {
        url: `https://chat.nerova.test/s/${input.accountId}?secret=session-secret`,
        expiresAt: new Date(clock().getTime() + SESSION_TTL_MS).toISOString(),
        ...(input.native ? { sessionId: `wsn_${input.accountId}`, state: 'native-state-secret' } : {}),
      };
    },
    async transcribe(accountId, file, opts) {
      if (fake.failWith) throw fake.failWith;
      // Like the real client: an unknown account is a route Nerova does not serve (404).
      if (!fake.accounts.some((a) => a.id === accountId || a.externalReference === accountId)) {
        throw new AppError('TRANSCRIPTION_UNAVAILABLE', 'Cloud transcription is not available');
      }
      fake.transcriptionRequests.push({ accountId, filename: file.filename, contentType: file.contentType, size: file.data.size, language: opts?.language, ...(opts?.vocabulary ? { vocabulary: opts.vocabulary } : {}) });
      return fake.transcription;
    },
    async getOutcomeSummary(idOrReference) {
      if (fake.failWith) throw fake.failWith;
      if (!fake.accounts.some((a) => a.id === idOrReference || a.externalReference === idOrReference)) {
        throw new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service rejected the request', { status: 404 });
      }
      return fake.outcomes;
    },
  };
  return fake;
}
