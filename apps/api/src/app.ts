import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { getContainer as defaultGetContainer, type Container } from './container.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { requireAuth, requireOrgOwnerSession, type ClerkClaims } from './middleware/auth.ts';
import { allowDeviceToken } from './middleware/deviceToken.ts';
import { baseContext, errorHandler, requireCronSecret } from './middleware/common.ts';
import { idempotency, type IdempotencyStore } from './middleware/idempotency.ts';
import { clerkWebhookRoutes } from './routes/clerk.ts';
import { cronRoutes } from './routes/cron.ts';
import { invalidateConnectorCache, nerovaRoutes } from './routes/nerova.ts';
import { nerovaWebhookRoutes } from './routes/nerovaWebhook.ts';
import { publicRoutes } from './routes/public.ts';
import { onboardingRoutes } from './routes/v1/onboarding.ts';
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

  // Onboarding runs before the business exists, so it has its own auth (org owner, no business row).
  // It must be registered before the requireAuth() wildcard, which would answer NO_BUSINESS.
  app.use('/v1/onboarding', requireOrgOwnerSession(options.verifyToken), idem);
  app.route('/v1/onboarding', onboardingRoutes);

  // Owner/staff API (Clerk JWT)
  // A `cvt_` device voice token is accepted on two routes only; everything else needs the Clerk session.
  app.use('/v1/*', allowDeviceToken(requireAuth(options.verifyToken)), idem);
  // A successful owner write may change what the connector caches (catalogue, staff, hours, plan): drop it now.
  app.use('/v1/*', async (c, next) => {
    await next();
    const businessId = c.get('auth')?.businessId;
    if (businessId && c.req.method !== 'GET' && c.res.status < 400) invalidateConnectorCache(c.get('container'), businessId);
  });
  app.route('/v1/whatsapp', v1WhatsAppRoutes);
  app.route('/v1', v1InboxRoutes);
  app.route('/v1', v1Routes);

  // Public web-booking comparator (no auth)
  app.use('/public/*', idem);
  app.route('/public', publicRoutes);

  // Signed inbound integrations
  app.route('/webhooks/clerk', clerkWebhookRoutes);
  app.route('/webhooks/whatsapp', whatsappWebhookRoutes);
  app.route('/webhooks/nerova', nerovaWebhookRoutes);
  app.route('/flows/whatsapp', whatsappFlowRoutes);

  // Nerova Booking connector (bearer token, MCP over streamable HTTP)
  app.route('/connector/nerova', nerovaRoutes);

  // Scheduled jobs (pg_cron via pg_net)
  app.use('/cron/*', requireCronSecret);
  app.route('/cron', cronRoutes);

  return app;
}
