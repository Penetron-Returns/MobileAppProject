/**
 * Companion orchestration: resolve our business to its Nerova account, mint owner chat sessions and read
 * outcome counts for Reports. Depends on the NerovaClient and PlanRepository ports only.
 */
import type { CompanionColorMode, CompanionNotReadyDetails, CompanionNotReadyReason, CompanionOutcomesDTO, MonthKey, UUID } from '@booking/types';
import { sha256Hex } from '@booking/features/lib/crypto.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { createLogger, type Logger } from '@booking/features/lib/logger.ts';
import type { PlanRepository } from '@booking/features/ports.ts';
import type { NerovaAccount, NerovaClient } from './client.ts';

/** Nerova accepts idempotency keys of 8 to 128 characters. */
const MAX_KEY_LENGTH = 128;

export interface CompanionSessionInput {
  /** Clerk user id: stable, not an email */
  ownerReference: string;
  colorMode: CompanionColorMode;
}

export interface CompanionService {
  /** COMPANION_NOT_READY (409) when there is no, or no provisioned, Nerova account. */
  createSession(businessId: UUID, input: CompanionSessionInput): Promise<{ url: string; expires_at: string }>;
  /** Nerova's outcome counts for the month, or null when Nerova is unavailable. Never throws. */
  getOutcomes(businessId: UUID, month: MonthKey): Promise<CompanionOutcomesDTO | null>;
}

export interface CompanionServiceDeps {
  nerova: NerovaClient;
  plans: PlanRepository;
  /** Allowlisted embed origin; unset means the companion is not configured */
  embedOrigin: string | undefined;
  clock: () => Date;
  logger?: Logger;
}

const notReady = (reason: CompanionNotReadyReason, nextStep?: string | null) => {
  const details: CompanionNotReadyDetails = { reason, ...(nextStep ? { next_step: nextStep } : {}) };
  return new AppError('COMPANION_NOT_READY', 'The companion is not ready yet', { ...details });
};

/** `companion-session-{account}-{owner}-{yyyy-mm-ddThh:mm}-{mode}`, hashed down when it would be too long. */
export function sessionIdempotencyKey(accountId: string, ownerReference: string, now: Date, colorMode: CompanionColorMode): string {
  const minute = now.toISOString().slice(0, 16);
  const key = `companion-session-${accountId}-${ownerReference}-${minute}-${colorMode}`;
  return key.length <= MAX_KEY_LENGTH ? key : `companion-session-${sha256Hex(key)}`;
}

export function createCompanionService(deps: CompanionServiceDeps): CompanionService {
  const { nerova, plans, clock } = deps;
  const logger = deps.logger ?? createLogger({ module: 'companion' });

  /** The business's Nerova account: the cached id first, then our business id (its externalReference). */
  async function resolveAccount(businessId: UUID, cachedId: string | null): Promise<NerovaAccount | null> {
    if (cachedId) {
      const cached = await nerova.getAccount(cachedId);
      if (cached) return cached;
    }
    const found = await nerova.getAccount(businessId);
    if (found && found.id !== cachedId) await plans.setNerovaAccountId(businessId, found.id);
    return found;
  }

  async function createSession(businessId: UUID, input: CompanionSessionInput) {
    if (!deps.embedOrigin) throw notReady('unavailable');
    const profile = await plans.getProfile(businessId);
    const account = await resolveAccount(businessId, profile.nerovaAccountId);
    if (!account) throw notReady('account_not_found', 'connect_booking_system');
    if (account.provisioningState !== 'ready') {
      const setup = await nerova.getCompanionSetup(account.id).catch(() => null);
      throw notReady('not_provisioned', setup?.nextStep ?? 'provision_account');
    }
    const session = await nerova.createOwnerChatSession({
      accountId: account.id,
      origin: deps.embedOrigin,
      ownerReference: input.ownerReference,
      colorMode: input.colorMode,
      idempotencyKey: sessionIdempotencyKey(account.id, input.ownerReference, clock(), input.colorMode),
    });
    return { url: session.url, expires_at: session.expiresAt };
  }

  async function getOutcomes(businessId: UUID, month: MonthKey): Promise<CompanionOutcomesDTO | null> {
    try {
      const profile = await plans.getProfile(businessId);
      const [year, mon] = month.split('-').map(Number) as [number, number];
      // Nerova accepts our business id as the account's externalReference.
      return await nerova.getOutcomeSummary(profile.nerovaAccountId ?? businessId, { year, month: mon });
    } catch (error) {
      logger.warn('companion_outcomes_unavailable', {
        business_id: businessId,
        code: error instanceof AppError ? error.code : 'UNKNOWN',
        details: error instanceof AppError ? error.details : undefined,
      });
      return null;
    }
  }

  return { createSession, getOutcomes };
}
