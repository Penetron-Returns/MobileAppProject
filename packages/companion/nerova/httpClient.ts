/** fetch implementation of NerovaClient. Bearer key, per-call timeout, every failure mapped to an AppError. */
import type { CompanionNotReadyReason, CompanionOutcomesDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import { createLogger, type Logger } from '@booking/features/lib/logger.ts';
import type { NerovaAccount, NerovaClient, NerovaOwnerChatSession, NerovaSetupStatus } from './client.ts';
import { parseOutcomeSummary } from './outcomes.ts';

export const NEROVA_API_BASE_URL = 'https://api.nerova.si';

/** The slice of the API environment the client reads. apps/api's Env is assignable to it. */
export interface NerovaEnv {
  readonly NEROVA_API_KEY?: string | undefined;
  readonly NEROVA_EMBED_ORIGIN?: string | undefined;
}

export interface HttpNerovaClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  logger?: Logger;
}

type Json = Record<string, unknown>;

const upstream = (message: string, details?: Record<string, unknown>) => new AppError('UPSTREAM_COMPANION_ERROR', message, details);
const notReady = (reason: CompanionNotReadyReason) => new AppError('COMPANION_NOT_READY', 'The companion is not ready yet', { reason });
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

export function createHttpNerovaClient(options: HttpNerovaClientOptions): NerovaClient {
  const doFetch = options.fetch ?? fetch;
  const logger = options.logger ?? createLogger({ module: 'companion_http' });
  const base = (options.baseUrl ?? NEROVA_API_BASE_URL).replace(/\/+$/, '');

  /** One request. Returns null on 404 when `allowNotFound`; every other failure is an upstream AppError. */
  async function request(
    method: 'GET' | 'POST',
    path: string,
    init: { body?: unknown; idempotencyKey?: string; allowNotFound?: boolean; notReadyOn?: (status: number, code: string | null) => CompanionNotReadyReason | null } = {},
  ): Promise<Json | null> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw upstream(timedOut ? 'The companion service timed out' : 'The companion service is unreachable', { reason: timedOut ? 'timeout' : 'network' });
    }
    if (response.status === 404 && init.allowNotFound) return null;
    const payload = (await response.json().catch(() => null)) as Json | null;
    if (!response.ok) {
      const reason = init.notReadyOn?.(response.status, text(payload?.code));
      if (reason) throw notReady(reason);
      // Nerova error bodies are RFC 9457 problem details with a stable `code`; never echo the request.
      throw upstream('The companion service rejected the request', { status: response.status, nerova_code: text(payload?.code) });
    }
    return payload ?? {};
  }

  /** Nerova answers 403 for both "no such account" and "key has no grant for it": a not-set-up-yet state. */
  const accountNotAvailable = (status: number, code: string | null): CompanionNotReadyReason | null =>
    status === 403 && code === 'auth.account_not_available' ? 'account_not_available' : null;

  /** Documented widget-session errors, all configuration the operator can fix. */
  const widgetSessionError = (origin: string) => (status: number, code: string | null): CompanionNotReadyReason | null => {
    if (status === 422 && (code === 'widget.origins_not_registered' || code === 'widget.origin_not_registered')) {
      logger.warn('companion_origin_not_registered', { origin });
      return 'origin_not_registered';
    }
    if (status === 403 && code === 'widget.authorization_invalid') return 'key_not_authorized';
    return accountNotAvailable(status, code);
  };

  const account = (idOrReference: string) => `/v1/accounts/${encodeURIComponent(idOrReference)}`;

  return {
    async getAccount(idOrReference): Promise<NerovaAccount | null> {
      const body = await request('GET', account(idOrReference), { allowNotFound: true, notReadyOn: accountNotAvailable });
      if (!body) return null;
      const id = text(body.id);
      if (!id) throw upstream('The companion service returned an unexpected account');
      return { id, provisioningState: text(body.provisioningState) };
    },

    async getCompanionSetup(idOrReference): Promise<NerovaSetupStatus | null> {
      const body = await request('GET', `${account(idOrReference)}/companion/setup`, { allowNotFound: true, notReadyOn: accountNotAvailable });
      return body ? { nextStep: text(body.nextStep) } : null;
    },

    async createOwnerChatSession(input): Promise<NerovaOwnerChatSession> {
      const body = await request('POST', `${account(input.accountId)}/widgets/sessions`, {
        idempotencyKey: input.idempotencyKey,
        notReadyOn: widgetSessionError(input.origin),
        body: {
          widget: 'owner_chat',
          origin: input.origin,
          ownerReference: input.ownerReference,
          theme: { colorMode: input.colorMode },
        },
      });
      const url = text(body?.url);
      const expiresAt = text(body?.expiresAt);
      if (!url || !expiresAt) throw upstream('The companion service returned an unexpected session');
      return { url, expiresAt };
    },

    async getOutcomeSummary(idOrReference, period): Promise<CompanionOutcomesDTO> {
      const query = `?year=${period.year}&month=${period.month}`;
      const body = await request('GET', `${account(idOrReference)}/outcomes/summary${query}`);
      return parseOutcomeSummary(body ?? {});
    },
  };
}

/** Used when NEROVA_API_KEY is unset: every call says the companion is not available, nothing leaves the process. */
export const unconfiguredNerovaClient: NerovaClient = (() => {
  const fail = async (): Promise<never> => {
    throw new AppError('COMPANION_NOT_READY', 'The companion is not available yet', { reason: 'unavailable' });
  };
  return { getAccount: fail, getCompanionSetup: fail, createOwnerChatSession: fail, getOutcomeSummary: fail };
})();

export function createNerovaClientFromEnv(env: NerovaEnv, options: Omit<HttpNerovaClientOptions, 'apiKey'> = {}): NerovaClient {
  return env.NEROVA_API_KEY ? createHttpNerovaClient({ ...options, apiKey: env.NEROVA_API_KEY }) : unconfiguredNerovaClient;
}
