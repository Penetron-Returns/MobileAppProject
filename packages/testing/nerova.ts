/** In-memory NerovaClient: accounts keyed by `acct_` id and externalReference, recorded session requests. */
import type { CompanionOutcomesDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import type {
  CreateConnectionSessionInput,
  CreateOwnerChatSessionInput,
  NerovaAccount,
  NerovaClient,
  NerovaConnectionSession,
  NerovaOwnerChatSession,
  NerovaSetupStatus,
} from '@booking/companion/nerova/client.ts';

export interface FakeNerovaAccount extends NerovaAccount {
  /** Our business id */
  externalReference: string;
  nextStep?: string | null;
  /** Defaults to not connected */
  whatsapp?: Partial<NerovaSetupStatus['whatsapp']>;
  receptionistLive?: boolean;
  /** Activation version; defaults to 1 */
  activationVersion?: number;
}

export interface FakeNerovaClient extends NerovaClient {
  accounts: FakeNerovaAccount[];
  /** Every createOwnerChatSession input, in order */
  sessionRequests: CreateOwnerChatSessionInput[];
  /** Every createConnectionSession input, in order (including rejected stale ones) */
  connectionSessionRequests: CreateConnectionSessionInput[];
  /** The next N createConnectionSession calls fail with a version conflict and move the activation version on */
  versionConflicts: number;
  outcomes: CompanionOutcomesDTO;
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
    connectionSessionRequests: [],
    versionConflicts: 0,
    outcomes: options.outcomes ?? { bookings_created: 0, bookings_rescheduled: 0, bookings_cancelled: 0, conversations_handled: 0 },
    failWith: null,
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
        whatsapp: { connected: false, state: 'not_connected', displayPhoneNumber: null, businessVerified: false, ...found.whatsapp },
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
