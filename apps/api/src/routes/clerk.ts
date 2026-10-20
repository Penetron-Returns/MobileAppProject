/**
 * Clerk webhook, mounted at /webhooks/clerk. Verified with Svix
 * (CLERK_WEBHOOK_SECRET), deduplicated in webhook_events (source 'clerk',
 * event_key = svix-id). Bad signatures → 400; handled, ignored and
 * duplicate events → 200; processing failures → error status so Svix retries.
 */
import { Hono } from 'hono';
import { Webhook } from 'svix';

import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { handleClerkEvent, type ClerkEvent } from '@booking/features/team/services/clerkSync.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { AppEnv } from '../types.ts';

export const clerkWebhookRoutes = new Hono<AppEnv>();

function parseEvent(payload: string): ClerkEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Webhook body must be JSON');
  }
  const event = parsed as Partial<ClerkEvent> | null;
  if (!event || typeof event.type !== 'string' || !event.data || typeof event.data !== 'object') {
    throw new AppError('VALIDATION_FAILED', 'Unexpected webhook payload');
  }
  return event as ClerkEvent;
}

clerkWebhookRoutes.post('/', async (c) => {
  const { env } = c.get('container');
  const secret = env.CLERK_WEBHOOK_SECRET;
  if (!secret) throw new AppError('INTERNAL', 'Clerk webhook is not configured');

  const payload = await c.req.text();
  const svixId = c.req.header('svix-id') ?? '';
  try {
    new Webhook(secret).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': c.req.header('svix-timestamp') ?? '',
      'svix-signature': c.req.header('svix-signature') ?? '',
    });
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Invalid webhook signature');
  }

  const event = parseEvent(payload);
  const repo = getBookingRepository(c.get('container'));
  const logger = c.get('logger');
  // Store only the event type and object id: the Clerk payload is full of PII.
  const objectId = typeof event.data.id === 'string' ? event.data.id : null;
  const { row, duplicate } = await repo.recordWebhookEvent('clerk', svixId, { type: event.type, object_id: objectId });
  if (duplicate && row.processed_at) {
    return c.json({ data: { status: 'duplicate' } });
  }

  try {
    const status = await handleClerkEvent(repo, event);
    await repo.finishWebhookEvent(row.id, { processedAt: new Date().toISOString(), error: null, attempts: row.attempts + 1 });
    logger.info('clerk_webhook', { type: event.type, status });
    return c.json({ data: { status } });
  } catch (err) {
    const code = err instanceof AppError ? err.code : 'INTERNAL';
    await repo
      .finishWebhookEvent(row.id, { processedAt: null, error: code, attempts: row.attempts + 1 })
      .catch(() => undefined);
    logger.error('clerk_webhook_failed', { type: event.type, code });
    throw err instanceof AppError && err.status >= 500 ? err : new AppError('INTERNAL', 'Webhook processing failed');
  }
});
