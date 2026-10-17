/**
 * Stripe webhook, mounted at /webhooks/stripe. The Stripe-Signature header is verified on the RAW body before
 * anything is parsed (401 on failure, 503 when STRIPE_WEBHOOK_SECRET is unset). Events are deduplicated in
 * webhook_events (source 'stripe', event_key = the Stripe event id). Processing is synchronous: a transient
 * failure answers 500 so Stripe retries, and the row keeps processed_at null so the retry is not mistaken for a
 * duplicate. Only the event id and type are stored, never the payload (it holds customer details).
 */
import { Hono } from 'hono';

import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { verifyStripeSignature } from '@booking/features/billing/lib/stripeSignature.ts';
import { asRecord, asString } from '@booking/features/billing/lib/stripeObjects.ts';
import type { StripeEvent } from '@booking/features/billing/ports.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { AppEnv } from '../types.ts';

function parseEvent(raw: string): StripeEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Webhook body must be JSON');
  }
  const event = asRecord(parsed);
  const id = asString(event.id);
  const type = asString(event.type);
  if (!id || !type || typeof event.created !== 'number') throw new AppError('VALIDATION_FAILED', 'Unexpected webhook payload');
  return { id, type, created: event.created, object: asRecord(asRecord(event.data).object) };
}

export const stripeWebhookRoutes = new Hono<AppEnv>();

stripeWebhookRoutes.post('/', async (c) => {
  const container = c.get('container');
  const logger = c.get('logger');
  const secret = container.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: { code: 'BILLING_NOT_CONFIGURED', message: 'Stripe webhook is not configured' } }, 503);

  const raw = await c.req.text();
  const verdict = verifyStripeSignature(secret, raw, c.req.header('stripe-signature'), container.clock());
  if (!verdict.ok) {
    logger.warn('stripe_webhook_rejected', { reason: verdict.reason });
    throw new AppError('UNAUTHENTICATED', 'Invalid webhook signature');
  }

  const event = parseEvent(raw);
  const repo = getBookingRepository(container);
  const { row, duplicate } = await repo.recordWebhookEvent('stripe', event.id, { type: event.type });
  if (duplicate && row.processed_at) return c.json({ data: { status: 'duplicate' } });

  try {
    const outcome = await container.billing.handleEvent(event);
    await repo.finishWebhookEvent(row.id, { processedAt: container.clock().toISOString(), error: null, attempts: row.attempts + 1 });
    logger.info('stripe_webhook', { type: event.type, outcome });
    return c.json({ data: { status: outcome } });
  } catch (error) {
    await repo.finishWebhookEvent(row.id, { processedAt: null, error: 'PROCESSING_FAILED', attempts: row.attempts + 1 }).catch(() => undefined);
    throw error;
  }
});
