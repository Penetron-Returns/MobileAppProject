/** In-memory NerovaClient: accounts keyed by `acct_` id and externalReference, recorded session requests. */
import type { CompanionOutcomesDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import type {
  CreateOwnerChatSessionInput,
  NerovaAccount,
  NerovaClient,
  NerovaOwnerChatSession,
  NerovaSetupStatus,
} from '@booking/companion/nerova/client.ts';

export interface FakeNerovaAccount extends NerovaAccount {
  /** Our business id */
  externalReference: string;
  nextStep?: string | null;
}

export interface FakeNerovaClient extends NerovaClient {
  accounts: FakeNerovaAccount[];
  /** Every createOwnerChatSession input, in order */
  sessionRequests: CreateOwnerChatSessionInput[];
  outcomes: CompanionOutcomesDTO;
  /** When set, every call throws this (a Nerova outage) */
  failWith: AppError | null;
}

const SESSION_TTL_MS = 15 * 60 * 1000;

export function createFakeNerovaClient(
  options: { accounts?: FakeNerovaAccount[]; outcomes?: CompanionOutcomesDTO; clock?: () => Date } = {},
): FakeNerovaClient {
  const clock = options.clock ?? (() => new Date());
  const fake: FakeNerovaClient = {
    accounts: options.accounts ?? [],
    sessionRequests: [],
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
      return found ? { nextStep: found.nextStep ?? null } : null;
    },
    async createOwnerChatSession(input): Promise<NerovaOwnerChatSession> {
      if (fake.failWith) throw fake.failWith;
      fake.sessionRequests.push(input);
      return {
        url: `https://chat.nerova.test/s/${input.accountId}?secret=session-secret`,
        expiresAt: new Date(clock().getTime() + SESSION_TTL_MS).toISOString(),
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
