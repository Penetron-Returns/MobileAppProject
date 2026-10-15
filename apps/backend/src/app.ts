import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getContainer as defaultGetContainer, type Container } from './container.ts';
import { AppError } from './lib/errors.ts';
import { requireAuth, type ClerkClaims } from './middleware/auth.ts';
import { baseContext, errorHandler, requireCronSecret } from './middleware/common.ts';
import { idempotency, type IdempotencyStore } from './middleware/idempotency.ts';
import { calendarWebhookRoutes, googleOAuthRoutes, v1CalendarRoutes } from './routes/calendar.ts';
import { clerkWebhookRoutes } from './routes/clerk.ts';
import { cronRoutes } from './routes/cron.ts';
import { publicRoutes } from './routes/public.ts';
import { v1Routes } from './routes/v1/index.ts';
import {
  v1InboxRoutes,
  v1WhatsAppRoutes,
  whatsappFlowRoutes,
  whatsappWebhookRoutes,
} from './routes/whatsapp/index.ts';
import type { AppEnv } from './types.ts';

export interface AppOptions {
  getContainer?: () => Container;
  /** Override Clerk verification (tests) */
  verifyToken?: (token: string) => Promise<ClerkClaims>;
  /** Override idempotency storage (tests) */
  idempotencyStore?: () => IdempotencyStore;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const idem = idempotency(options.idempotencyStore ? () => options.idempotencyStore!() : undefined);

  app.onError(errorHandler);
  app.notFound((c) => {
    throw new AppError('NOT_FOUND', `No route for ${c.req.method} ${c.req.path}`);
  });

  app.use('*', baseContext(options.getContainer ?? defaultGetContainer));
  app.use('/v1/*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'], exposeHeaders: ['X-Request-Id'] }));
  app.use('/public/*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Request-Id'], exposeHeaders: ['X-Request-Id'] }));

  app.get('/health', (c) => c.json({ data: { ok: true, time: new Date().toISOString() } }));

  // Owner/staff API (Clerk JWT)
  app.use('/v1/*', requireAuth(options.verifyToken), idem);
  app.route('/v1/whatsapp', v1WhatsAppRoutes);
  app.route('/v1/calendar', v1CalendarRoutes);
  app.route('/v1', v1InboxRoutes);
  app.route('/v1', v1Routes);

  // Public web-booking comparator (no auth)
  app.use('/public/*', idem);
  app.route('/public', publicRoutes);

  // Signed inbound integrations
  app.route('/webhooks/clerk', clerkWebhookRoutes);
  app.route('/webhooks/whatsapp', whatsappWebhookRoutes);
  app.route('/flows/whatsapp', whatsappFlowRoutes);
  app.route('/webhooks/google-calendar', calendarWebhookRoutes);

  // OAuth redirect targets (signed state, no session)
  app.route('/oauth/google', googleOAuthRoutes);

  // Scheduled jobs (pg_cron via pg_net)
  app.use('/cron/*', requireCronSecret);
  app.route('/cron', cronRoutes);

  return app;
}
