/**
 * Companion orchestration: resolve our business to its Nerova account, mint owner chat sessions and read
 * outcome counts for Reports. Depends on the NerovaClient and PlanRepository ports only.
 */
import type {
  CompanionColorMode,
  CompanionNotReadyDetails,
  CompanionNotReadyReason,
  CompanionOutcomesDTO,
  CompanionSessionDTO,
  CompanionSetupDTO,
  CompanionSetupStep,
  CompanionWhatsAppConnectSessionDTO,
  MonthKey,
  UUID,
} from '@booking/types';
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
  /** Default 'web' */
  platform?: 'web' | 'native';
}

export const DEFAULT_NATIVE_APP_ID = 'si.nerova.booking.dev';

/** The only return URL we forward: the admin app's own WhatsApp-return route (optional query, no fragment). */
const RETURN_URL_ALLOWLIST = /^bookingadmin:\/\/\/?companion\/whatsapp-return(\?[^#]*)?$/;
export const isAllowedReturnUrl = (url: string): boolean => RETURN_URL_ALLOWLIST.test(url);

export interface CompanionService {
  /** COMPANION_NOT_READY (409) when there is no, or no provisioned, Nerova account. */
  createSession(businessId: UUID, input: CompanionSessionInput): Promise<CompanionSessionDTO>;
  /** The owner's next setup step and WhatsApp status. No Nerova account yet is `connect_booking_system`, not an error. */
  getSetup(businessId: UUID): Promise<CompanionSetupDTO>;
  /**
   * Starts the hosted WhatsApp connect flow. COMPANION_NOT_READY (409) without a provisioned account,
   * WHATSAPP_ALREADY_CONNECTED (409) when WhatsApp is already connected. The launch URL is a secret.
   */
  createWhatsAppConnectSession(businessId: UUID, options?: { returnUrl?: string | undefined }): Promise<CompanionWhatsAppConnectSessionDTO>;
  /** Nerova's outcome counts for the month, or null when Nerova is unavailable. Never throws. */
  getOutcomes(businessId: UUID, month: MonthKey): Promise<CompanionOutcomesDTO | null>;
}

export interface CompanionServiceDeps {
  nerova: NerovaClient;
  plans: PlanRepository;
  /** Allowlisted embed origin; unset means the companion is not configured */
  embedOrigin: string | undefined;
  /** NEROVA_NATIVE_SESSIONS: honour platform 'native' (default off: every session is a web session) */
  nativeSessions?: boolean;
  /** NEROVA_APP_ID; defaults to DEFAULT_NATIVE_APP_ID */
  nativeAppId?: string | undefined;
  /** NEROVA_WHATSAPP_RETURN_URL: forward an allowlisted return_url to Nerova (default off: dropped) */
  forwardReturnUrl?: boolean;
  clock: () => Date;
  logger?: Logger;
}

const notReady = (reason: CompanionNotReadyReason, nextStep?: string | null) => {
  const details: CompanionNotReadyDetails = { reason, ...(nextStep ? { next_step: nextStep } : {}) };
  return new AppError('COMPANION_NOT_READY', 'The companion is not ready yet', { ...details });
};

/** `companion-session-{account}-{owner}-{yyyy-mm-ddThh:mm}-{mode}`, hashed down when it would be too long. */
export function sessionIdempotencyKey(accountId: string, ownerReference: string, now: Date, colorMode: string): string {
  const minute = now.toISOString().slice(0, 16);
  const key = `companion-session-${accountId}-${ownerReference}-${minute}-${colorMode}`;
  return key.length <= MAX_KEY_LENGTH ? key : `companion-session-${sha256Hex(key)}`;
}

const SETUP_STEPS: readonly CompanionSetupStep[] = ['connect_booking_system', 'verify_booking_connection', 'provision_account', 'connect_whatsapp', 'go_live', 'none'];
const VERSION_CONFLICT = 'activation.version_conflict';
/** One re-read of the setup (version) when a concurrent activation command moved the version. */
const MAX_SESSION_ATTEMPTS = 2;

/** `companion-wa-connect-{account}-{yyyy-mm-ddThh:mm}-v{version}`: a retry in the same minute replays the same session. */
export function connectSessionIdempotencyKey(accountId: string, now: Date, version: number): string {
  const key = `companion-wa-connect-${accountId}-${now.toISOString().slice(0, 16)}-v${version}`;
  return key.length <= MAX_KEY_LENGTH ? key : `companion-wa-connect-${sha256Hex(key)}`;
}

const isVersionConflict = (error: unknown): boolean => error instanceof AppError && error.details?.nerova_code === VERSION_CONFLICT;

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
    const native = input.platform === 'native' && deps.nativeSessions === true;
    const session = await nerova.createOwnerChatSession({
      accountId: account.id,
      ...(native ? { native: { appId: deps.nativeAppId || DEFAULT_NATIVE_APP_ID } } : { origin: deps.embedOrigin }),
      ownerReference: input.ownerReference,
      colorMode: input.colorMode,
      // A native session must not replay a web one minted in the same minute (different body, same key).
      idempotencyKey: sessionIdempotencyKey(account.id, input.ownerReference, clock(), native ? `${input.colorMode}-native` : input.colorMode),
    });
    // session_id and state are native-only, so the web response stays { url, expires_at }.
    return {
      url: session.url,
      expires_at: session.expiresAt,
      ...(native && session.sessionId ? { session_id: session.sessionId } : {}),
      ...(native ? { state: session.state ?? null } : {}),
    };
  }

  const noAccountSetup: CompanionSetupDTO = {
    next_step: 'connect_booking_system',
    whatsapp: { connected: false, state: 'not_connected', display_phone_number: null, business_verified: false },
    companion_live: false,
  };

  async function getSetup(businessId: UUID): Promise<CompanionSetupDTO> {
    const profile = await plans.getProfile(businessId);
    const account = await resolveAccount(businessId, profile.nerovaAccountId);
    if (!account) return noAccountSetup;
    const setup = await nerova.getCompanionSetup(account.id);
    if (!setup) return noAccountSetup;
    const step = SETUP_STEPS.find((s) => s === setup.nextStep);
    if (!step) throw new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service returned an unexpected setup', { reason: 'unexpected_setup' });
    return {
      next_step: step,
      whatsapp: {
        connected: setup.whatsapp.connected,
        state: setup.whatsapp.state,
        display_phone_number: setup.whatsapp.displayPhoneNumber,
        business_verified: setup.whatsapp.businessVerified,
      },
      companion_live: setup.receptionistLive,
    };
  }

  async function createWhatsAppConnectSession(businessId: UUID, options: { returnUrl?: string | undefined } = {}): Promise<CompanionWhatsAppConnectSessionDTO> {
    if (!deps.embedOrigin) throw notReady('unavailable');
    // Forwarded only with NEROVA_WHATSAPP_RETURN_URL on (before #946 Nerova's body rejects unknown fields); otherwise dropped.
    const returnUrl = deps.forwardReturnUrl ? options.returnUrl : undefined;
    if (returnUrl !== undefined && !isAllowedReturnUrl(returnUrl)) {
      throw new AppError('VALIDATION_FAILED', 'return_url is not an allowed return URL', { field: 'return_url' });
    }
    const profile = await plans.getProfile(businessId);
    const account = await resolveAccount(businessId, profile.nerovaAccountId);
    if (!account) throw notReady('account_not_found', 'connect_booking_system');
    for (let attempt = 1; ; attempt += 1) {
      // The setup read gives the already-connected check and the activation version; a retry re-reads both.
      const setup = await nerova.getCompanionSetup(account.id);
      if (!setup) throw notReady('account_not_found', 'connect_booking_system');
      if (account.provisioningState !== 'ready') throw notReady('not_provisioned', setup.nextStep ?? 'provision_account');
      if (setup.whatsapp.connected) throw new AppError('WHATSAPP_ALREADY_CONNECTED', 'WhatsApp is already connected');
      if (setup.version === null) throw new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service returned an unexpected setup', { reason: 'unexpected_setup' });
      try {
        const session = await nerova.createConnectionSession({
          accountId: account.id,
          embedOrigin: deps.embedOrigin,
          expectedVersion: setup.version,
          ...(returnUrl ? { returnUrl, appId: deps.nativeAppId || DEFAULT_NATIVE_APP_ID } : {}),
          idempotencyKey: connectSessionIdempotencyKey(account.id, clock(), setup.version),
        });
        return { launch_url: session.launchUrl, expires_at: session.expiresAt };
      } catch (error) {
        if (!isVersionConflict(error) || attempt >= MAX_SESSION_ATTEMPTS) throw error;
      }
    }
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

  return { createSession, getSetup, createWhatsAppConnectSession, getOutcomes };
}
