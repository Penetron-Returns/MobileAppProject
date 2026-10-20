import { Buffer } from 'node:buffer';

import { Hono } from 'hono';

import { safeEqual } from '@booking/features/lib/crypto.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { AppEnv } from '../../types.ts';
import { getWaDeps } from '@booking/app-store/whatsapp/deps.ts';
import { verifyMetaSignature } from '@booking/app-store/whatsapp/signature.ts';
import { WebhookPayload } from '@booking/app-store/whatsapp/webhook/events.ts';
import { processWebhook } from '@booking/app-store/whatsapp/webhook/process.ts';

/**
 * Mounted at /webhooks/whatsapp. The signature is checked on the raw body
 * before anything is parsed. Authentic payloads always get 200, except when
 * the events cannot even be recorded (database down): then 500, so Meta
 * redelivers later instead of the events being lost.
 */
export const whatsappWebhookRoutes = new Hono<AppEnv>();

// Meta's subscription handshake.
whatsappWebhookRoutes.get('/', (c) => {
  const expected = c.get('container').env.WHATSAPP_VERIFY_TOKEN;
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token') ?? '';
  const challenge = c.req.query('hub.challenge') ?? '';
  if (mode === 'subscribe' && expected && safeEqual(token, expected)) return c.text(challenge, 200);
  return c.text('Forbidden', 403);
});

whatsappWebhookRoutes.post('/', async (c) => {
  const container = c.get('container');
  const logger = c.get('logger');
  const raw = Buffer.from(await c.req.arrayBuffer());
  if (!verifyMetaSignature(container.env.META_APP_SECRET, raw, c.req.header('x-hub-signature-256'))) {
    logger.warn('wa_webhook_bad_signature');
    throw new AppError('UNAUTHENTICATED', 'Invalid signature');
  }

  let parsed: WebhookPayload;
  try {
    const result = WebhookPayload.safeParse(JSON.parse(raw.toString('utf8')));
    if (!result.success) throw new Error('shape');
    parsed = result.data;
  } catch {
    // Authentic but unusable: acknowledge so Meta does not retry forever.
    logger.warn('wa_webhook_unparseable');
    return c.json({ data: { received: true } }, 200);
  }

  // Throws only if events could not be recorded, so Meta retries (500).
  const summary = await processWebhook(getWaDeps(container, logger), parsed);
  logger.info('wa_webhook', { ...summary });
  return c.json({ data: { received: true } }, 200);
});
