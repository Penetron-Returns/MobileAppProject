/** WhatsApp route modules, mounted in src/app.ts (docs/BUILD_PLAN.md §4, WS-C). */
import { Hono } from 'hono';

import type { AppEnv } from '../../types.ts';

export { whatsappFlowRoutes } from './flows.ts';
export { whatsappWebhookRoutes } from './webhook.ts';

/** Mounted at /v1/whatsapp behind requireAuth() + idempotency() */
export const v1WhatsAppRoutes = new Hono<AppEnv>();
/** Mounted at /v1 behind requireAuth() + idempotency(): /conversations/**, /escalations/** */
export const v1InboxRoutes = new Hono<AppEnv>();
