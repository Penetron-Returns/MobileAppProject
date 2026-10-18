/** fetch implementation of NerovaClient. Bearer key, per-call timeout, every failure mapped to an AppError. */
import type { CompanionNotReadyReason, CompanionOutcomesDTO, CompanionSettingsDTO } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import { createLogger, type Logger } from '@booking/features/lib/logger.ts';
import type { CompanionSettingsPatch, NerovaAccount, NerovaClient, NerovaConnectionSession, NerovaOwnerChatSession, NerovaSetupStatus, NerovaTranscription, TranscribeFile, TranscribeOptions } from './client.ts';
import { parseOutcomeSummary } from './outcomes.ts';

export const NEROVA_API_BASE_URL = 'https://api.nerova.si';
/** Speech-to-text of a short clip is slower than a JSON call. */
export const TRANSCRIBE_TIMEOUT_MS = 15_000;

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
/** Setup mismatches between us and Nerova (any status, 400 or 422): a clear upstream error with a stable reason. */
const CONFIG_REJECTIONS = ['return_url_not_allowed', 'app_not_registered', 'origin_unexpected'] as const;
function mapConfigRejection(error: unknown): never {
  const code = error instanceof AppError ? text(error.details?.nerova_code) : null;
  const reason = code ? CONFIG_REJECTIONS.find((r) => code === r || code.endsWith(`.${r}`)) : undefined;
  if (reason && error instanceof AppError) {
    throw upstream(`The companion service rejected the request (${reason})`, { status: error.details?.status, nerova_code: code, reason });
  }
  throw error;
}
const record = (value: unknown): Json => (typeof value === 'object' && value !== null ? (value as Json) : {});
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);

/** Maps a Nerova transcription problem response (stable `code`) to our AppError. */
function transcriptionError(status: number, code: string | null, retryAfter: string | null): AppError {
  const reason = code ?? `http_${status}`;
  if (status === 404) return new AppError('TRANSCRIPTION_UNAVAILABLE', 'Cloud transcription is not available');
  if (status === 400) return new AppError('VALIDATION_FAILED', 'The audio was rejected', { reason });
  if (status === 413) return new AppError('PAYLOAD_TOO_LARGE', 'The audio clip is too long', { reason });
  if (status === 415) return new AppError('UNSUPPORTED_MEDIA_TYPE', 'Unsupported audio format', { reason });
  if (status === 429) {
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    return new AppError('RATE_LIMITED', 'Transcription is rate limited, try again shortly', {
      reason,
      ...(Number.isFinite(seconds) && seconds >= 0 ? { retry_after_s: seconds } : {}),
    });
  }
  return upstream('The transcription service could not process the request', { reason, status });
}

/** One named entry's `dur` (ms) from a `Server-Timing` header, e.g. `provider;dur=412.5, total;dur=800`, or null. */
export function serverTimingEntryMs(header: string | null, name: string): number | null {
  for (const entry of (header ?? '').split(',')) {
    const [metric, ...params] = entry.trim().split(';');
    if (metric?.trim().toLowerCase() !== name) continue;
    for (const param of params) {
      const dur = param.trim().match(/^dur=([0-9.]+)$/);
      if (dur) return Number(dur[1]);
    }
    return null;
  }
  return null;
}

/** Provider and total time of a Nerova response (a lone `dur` under any other name counts as the provider time). */
function transcriptionTiming(header: string | null): { providerMs: number | null; totalMs: number | null } {
  const totalMs = serverTimingEntryMs(header, 'total');
  const providerMs = serverTimingEntryMs(header, 'provider');
  if (providerMs !== null || totalMs !== null) return { providerMs, totalMs };
  const lone = header?.match(/dur=([0-9.]+)/);
  return { providerMs: lone ? Number(lone[1]) : null, totalMs: null };
}

const APPROVAL_POLICIES = ['always', 'risky_only', 'never'] as const;

function parseSettings(body: Json): CompanionSettingsDTO {
  const policy = APPROVAL_POLICIES.find((p) => p === body.approvalPolicy);
  const window = body.undoWindowSeconds;
  if (!policy || typeof window !== 'number' || !Number.isInteger(window)) throw upstream('The companion service returned unexpected settings', { reason: 'unexpected_response' });
  return { approvalPolicy: policy, undoWindowSeconds: window, updatedAt: text(body.updatedAt) };
}

export function createHttpNerovaClient(options: HttpNerovaClientOptions): NerovaClient {
  const doFetch = options.fetch ?? fetch;
  const logger = options.logger ?? createLogger({ module: 'companion_http' });
  const base = (options.baseUrl ?? NEROVA_API_BASE_URL).replace(/\/+$/, '');

  /** One request. Returns null on 404 when `allowNotFound`; every other failure is an upstream AppError. */
  async function request(
    method: 'GET' | 'POST' | 'PATCH',
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

  /** Connection-session errors: an unprovisioned account is a state the owner or Nerova setup can resolve. */
  const connectionSessionError = (status: number, code: string | null): CompanionNotReadyReason | null =>
    status === 409 && code === 'activation.not_provisioned' ? 'not_provisioned' : accountNotAvailable(status, code);

  async function transcribe(accountId: string, file: TranscribeFile, opts: TranscribeOptions = {}): Promise<NerovaTranscription> {
    // A fresh FormData: the part is the Blob under the field name Nerova documents.
    const form = new FormData();
    form.append('audio', file.data, file.filename);
    if (opts.language) form.append('language', opts.language);
    if (opts.vocabulary) form.append('vocabulary', opts.vocabulary);
    const started = Date.now();
    let response: Response;
    try {
      response = await doFetch(`${base}${account(accountId)}/transcriptions`, {
        method: 'POST',
        // No Content-Type: fetch sets the multipart boundary itself.
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
        body: form,
        signal: AbortSignal.timeout(options.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw upstream(timedOut ? 'The transcription service timed out' : 'The transcription service is unreachable', { reason: timedOut ? 'timeout' : 'network' });
    }
    const timing = transcriptionTiming(response.headers.get('server-timing'));
    // Sizes and timings only: never the audio or the transcript.
    logger.info('nerova_transcription', {
      status: response.status,
      size_bytes: file.data.size,
      provider_ms: timing.providerMs,
      total_ms: timing.totalMs,
      round_trip_ms: Date.now() - started,
    });
    const payload = (await response.json().catch(() => null)) as Json | null;
    if (!response.ok) throw transcriptionError(response.status, text(payload?.code), response.headers.get('retry-after'));
    const durationMs = payload?.durationMs;
    if (typeof payload?.text !== 'string' || typeof durationMs !== 'number') {
      throw upstream('The transcription service returned an unexpected response', { reason: 'unexpected_response' });
    }
    return { text: payload.text, durationMs, language: text(payload.language), timing };
  }

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
      if (!body) return null;
      const whatsapp = record(body.whatsApp);
      return {
        nextStep: text(body.nextStep),
        whatsapp: {
          connected: whatsapp.connected === true,
          state: text(whatsapp.state) ?? 'not_connected',
          displayPhoneNumber: text(whatsapp.displayPhoneNumber),
          businessVerified: whatsapp.businessVerified === true,
          businessVerificationStatus: text(whatsapp.businessVerificationStatus),
        },
        provisioned: body.provisioned === true,
        bookingConnection: text(body.bookingConnection),
        blockingReasons: Array.isArray(body.blockingReasons) ? body.blockingReasons.filter((r): r is string => typeof r === 'string' && r.length > 0) : [],
        // Nerova answers `companionLive`; `receptionistLive` is the older name.
        receptionistLive: body.companionLive === true || body.receptionistLive === true,
        version: typeof body.version === 'number' && Number.isInteger(body.version) ? body.version : null,
      };
    },


    async createConnectionSession(input): Promise<NerovaConnectionSession> {
      // The launch URL carries a secret `#state=`: it is returned untouched and never logged.
      const body = await request('POST', `${account(input.accountId)}/connection-sessions`, {
        idempotencyKey: input.idempotencyKey,
        notReadyOn: connectionSessionError,
        body: {
          channel: 'whats_app',
          embedOrigin: input.embedOrigin,
          expectedVersion: input.expectedVersion,
          // returnUrl travels with the registered appId (Nerova checks the scheme against that app's returnUrlSchemes).
          ...(input.returnUrl ? { returnUrl: input.returnUrl, appId: input.appId } : {}),
        },
      }).catch(mapConfigRejection);
      const launchUrl = text(body?.launchUrl);
      const expiresAt = text(body?.expiresAt);
      if (!launchUrl || !expiresAt) throw upstream('The companion service returned an unexpected connection session');
      return { launchUrl, expiresAt };
    },

    async createOwnerChatSession(input): Promise<NerovaOwnerChatSession> {
      const body = await request('POST', `${account(input.accountId)}/widgets/sessions`, {
        idempotencyKey: input.idempotencyKey,
        notReadyOn: widgetSessionError(input.origin ?? ''),
        body: {
          widget: 'owner_chat',
          ownerReference: input.ownerReference,
          theme: { colorMode: input.colorMode },
          ...(input.native
            ? { platform: 'native', appId: input.native.appId }
            : {
                origin: input.origin,
                // The app frames the chat in its own sheet and draws its own character, so Nerova must fill the frame and hide its avatar.
                // An invalid value is a 400 `widget.presentation_invalid`, surfaced as UPSTREAM_COMPANION_ERROR with that nerova_code.
                layout: 'fill',
                avatar: 'hidden',
              }),
        },
      }).catch(mapConfigRejection);
      const url = text(body?.url);
      const expiresAt = text(body?.expiresAt);
      if (!url || !expiresAt) throw upstream('The companion service returned an unexpected session');
      const sessionId = text(body?.sessionId);
      const state = text(body?.state);
      // sessionId and state are native-only; the web session keeps its two-field shape.
      return { url, expiresAt, ...(input.native && sessionId ? { sessionId } : {}), ...(input.native && state ? { state } : {}) };
    },

    transcribe,

    async getCompanionSettings(idOrReference) {
      const body = await request('GET', `${account(idOrReference)}/companion/settings`, { allowNotFound: true, notReadyOn: accountNotAvailable });
      return body ? parseSettings(body) : null;
    },

    async updateCompanionSettings(idOrReference, patch: CompanionSettingsPatch, idempotencyKey) {
      try {
        const body = await request('PATCH', `${account(idOrReference)}/companion/settings`, { body: patch, idempotencyKey, notReadyOn: accountNotAvailable });
        return parseSettings(body ?? {});
      } catch (error) {
        if (error instanceof AppError && error.details?.nerova_code === 'settings.invalid') {
          throw new AppError('VALIDATION_FAILED', 'The companion settings were rejected', { reason: 'settings.invalid', nerova_code: 'settings.invalid' });
        }
        throw error;
      }
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
  return { getAccount: fail, getCompanionSetup: fail, createConnectionSession: fail, createOwnerChatSession: fail, transcribe: fail, getOutcomeSummary: fail, getCompanionSettings: fail, updateCompanionSettings: fail };
})();

export function createNerovaClientFromEnv(env: NerovaEnv, options: Omit<HttpNerovaClientOptions, 'apiKey'> = {}): NerovaClient {
  return env.NEROVA_API_KEY ? createHttpNerovaClient({ ...options, apiKey: env.NEROVA_API_KEY }) : unconfiguredNerovaClient;
}
