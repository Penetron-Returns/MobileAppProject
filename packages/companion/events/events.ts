/**
 * Signed account events to Nerova (Standard Webhooks). They tell Nerova to
 * re-read an account (`accounts_get`) instead of waiting for the daily
 * reconcile. Disabled unless NEROVA_EVENTS_ENABLED=true and both the URL and
 * the signing secret are set; the sender is a port so tests use a fake and
 * nothing here can reach Nerova Production by accident.
 */
import { Buffer } from 'node:buffer';
import { createHmac, randomUUID } from 'node:crypto';

import type { UUID } from '@booking/types';
import { createLogger, type Logger } from '@booking/features/lib/logger.ts';
import type { AccountEventsPort, AccountEventType, EntitlementService } from '@booking/features/ports.ts';
import type { AppointmentEventType } from './appointmentEvents.ts';

/** Everything the sender signs: account events and (flagged) appointment events share the envelope. */
export interface AccountEvent {
  id: string;
  type: AccountEventType | AppointmentEventType;
  createdAt: string;
  data: { id: UUID; [field: string]: unknown };
}

/** Delivery options for one send. */
export interface SendOptions {
  /** Retry with backoff on 5xx and 409 connection.sync_in_progress (account.created: it must reach Nerova) */
  retry?: boolean;
}

/** Outbound transport port. */
export interface AccountEventSender {
  send(event: AccountEvent, options?: SendOptions): Promise<void>;
}

/** Nerova refused or failed an event. `code` is Nerova's error code when the body had one (never any customer data). */
export class EventDeliveryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(`Nerova events endpoint answered ${status}${code ? ` ${code}` : ''}`);
    this.name = 'EventDeliveryError';
  }
}

/** Pulls Nerova's error code (`{ error: { code } }` or `{ code }`) out of a response body, without trusting its shape. */
function errorCodeOf(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; error?: { code?: unknown } | string } | null;
    const code = parsed?.code ?? (typeof parsed?.error === 'object' ? parsed?.error?.code : undefined);
    return typeof code === 'string' ? code.slice(0, 80) : null;
  } catch {
    return null;
  }
}

/** 5xx and 409 sync_in_progress are worth another try; 401 (signature/clock) and 409 disconnected are not. */
function isRetryable(status: number, code: string | null): boolean {
  return status >= 500 || (status === 409 && code === 'connection.sync_in_progress');
}

/** Delays before retries 1..n (the first attempt is immediate): 1s, 4s, 15s. */
export const RETRY_BACKOFF_MS: readonly number[] = [1000, 4000, 15000];

/** `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<body>">`, keyed with the base64 part of `whsec_...`. */
export function signStandardWebhook(signingSecret: string, id: string, timestampSeconds: number, body: string): string {
  const key = Buffer.from(signingSecret.replace(/^whsec_/, ''), 'base64');
  const digest = createHmac('sha256', key).update(`${id}.${timestampSeconds}.${body}`).digest('base64');
  return `v1,${digest}`;
}

export interface HttpSenderOptions {
  url: string;
  signingSecret: string;
  fetch?: typeof fetch;
  clock?: () => Date;
  timeoutMs?: number;
  /** Injected so tests never wait */
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: readonly number[];
}

export function createHttpEventSender(options: HttpSenderOptions): AccountEventSender {
  const doFetch = options.fetch ?? fetch;
  const clock = options.clock ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const backoff = options.backoffMs ?? RETRY_BACKOFF_MS;

  async function attempt(event: AccountEvent): Promise<void> {
      const body = JSON.stringify(event);
      // Nerova accepts timestamps within five minutes (recomputed per attempt); the id doubles as the replay key.
      const timestamp = Math.floor(clock().getTime() / 1000);
      const response = await doFetch(options.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'webhook-id': event.id,
          'webhook-timestamp': String(timestamp),
          'webhook-signature': signStandardWebhook(options.signingSecret, event.id, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      });
      if (response.ok) return;
      const code = errorCodeOf(await response.text().catch(() => ''));
      throw new EventDeliveryError(response.status, code, isRetryable(response.status, code));
  }

  return {
    async send(event, sendOptions) {
      for (let tries = 0; ; tries++) {
        try {
          return await attempt(event);
        } catch (error) {
          const retryable = !(error instanceof EventDeliveryError) || error.retryable;
          if (!sendOptions?.retry || !retryable || tries >= backoff.length) throw error;
          await sleep(backoff[tries]!);
        }
      }
    },
  };
}

/** Sender used when events are off (the default). */
export const disabledEventSender: AccountEventSender = { async send() {} };

/** The slice of the API environment the event sender reads. apps/api's Env is assignable to it. */
export interface EventsEnv {
  readonly NEROVA_EVENTS_ENABLED?: string | undefined;
  readonly NEROVA_EVENTS_URL?: string | undefined;
  readonly NEROVA_EVENTS_SIGNING_SECRET?: string | undefined;
}

export function eventSenderFromEnv(
  env: EventsEnv,
  logger: Logger = createLogger({ module: 'nerova_events' }),
): AccountEventSender {
  if (env.NEROVA_EVENTS_ENABLED !== 'true') return disabledEventSender;
  const { NEROVA_EVENTS_URL: url, NEROVA_EVENTS_SIGNING_SECRET: signingSecret } = env;
  if (!url || !signingSecret) {
    logger.warn('nerova_events_misconfigured', { reason: 'NEROVA_EVENTS_URL and NEROVA_EVENTS_SIGNING_SECRET are required' });
    return disabledEventSender;
  }
  const isLocal = /^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
  if (!url.startsWith('https://') && !isLocal) {
    logger.warn('nerova_events_misconfigured', { reason: 'NEROVA_EVENTS_URL must be https' });
    return disabledEventSender;
  }
  return createHttpEventSender({ url, signingSecret });
}

export interface AccountEventsDeps {
  sender: AccountEventSender;
  entitlements: EntitlementService;
  logger?: Logger;
  clock?: () => Date;
  newId?: () => string;
}

/**
 * Account-change notifier. created/updated are only sent for businesses that
 * are entitled to the companion (a Free business is never exposed to Nerova);
 * removed is always sent so Nerova can pause an account that lost its plan.
 * Delivery is best effort and never throws: Nerova reconciles daily.
 */
export function createAccountEvents(deps: AccountEventsDeps): AccountEventsPort {
  const logger = deps.logger ?? createLogger({ module: 'nerova_events' });
  const clock = deps.clock ?? (() => new Date());
  const newId = deps.newId ?? (() => `evt_${randomUUID()}`);
  return {
    async accountChanged(businessId, type) {
      try {
        if (type !== 'account.removed' && !(await deps.entitlements.hasFeature(businessId, 'companion'))) return;
        // account.created uses a stable id per account (Nerova dedupes on it: a replay answers "replayed") and is retried.
        const isCreated = type === 'account.created';
        const id = isCreated ? `acct_created:${businessId}` : newId();
        await deps.sender.send({ id, type, createdAt: clock().toISOString(), data: { id: businessId } }, { retry: isCreated });
      } catch (error) {
        // account.no_locations means the connector's accounts read has no location for this business yet.
        const code = error instanceof EventDeliveryError ? error.code : null;
        logger.warn('nerova_event_failed', { business_id: businessId, type, status: error instanceof EventDeliveryError ? error.status : null, nerova_code: code, error: code ? undefined : error });
      }
    },
  };
}
