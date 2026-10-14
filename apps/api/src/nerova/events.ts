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
import type { Env } from '../env.ts';
import { createLogger, type Logger } from '../lib/logger.ts';
import type { AccountEventsPort, AccountEventType, EntitlementService } from '../ports.ts';

export interface AccountEvent {
  id: string;
  type: AccountEventType;
  createdAt: string;
  data: { id: UUID };
}

/** Outbound transport port. */
export interface AccountEventSender {
  send(event: AccountEvent): Promise<void>;
}

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
}

export function createHttpEventSender(options: HttpSenderOptions): AccountEventSender {
  const doFetch = options.fetch ?? fetch;
  const clock = options.clock ?? (() => new Date());
  return {
    async send(event) {
      const body = JSON.stringify(event);
      // Nerova accepts timestamps within five minutes; the id doubles as the replay key.
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
      if (!response.ok) throw new Error(`Nerova events endpoint answered ${response.status}`);
    },
  };
}

/** Sender used when events are off (the default). */
export const disabledEventSender: AccountEventSender = { async send() {} };

export function eventSenderFromEnv(env: Env, logger: Logger = createLogger({ module: 'nerova_events' })): AccountEventSender {
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
        await deps.sender.send({ id: newId(), type, createdAt: clock().toISOString(), data: { id: businessId } });
      } catch (error) {
        logger.warn('nerova_event_failed', { business_id: businessId, type, error });
      }
    },
  };
}
