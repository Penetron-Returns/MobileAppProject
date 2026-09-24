// STUB — WS-C implements. See docs/BUILD_PLAN.md §4–5.
import { Hono } from 'hono';

import type { AppEnv } from '../../types.ts';

/** Mounted at /webhooks/whatsapp (GET verify, POST signed events) */
export const whatsappWebhookRoutes = new Hono<AppEnv>();
/** Mounted at /flows/whatsapp (encrypted Flows data exchange) */
export const whatsappFlowRoutes = new Hono<AppEnv>();
/** Mounted at /v1/whatsapp behind requireAuth() + idempotency() */
export const v1WhatsAppRoutes = new Hono<AppEnv>();
/** Mounted at /v1 behind requireAuth() + idempotency(): /conversations/**, /escalations/** */
export const v1InboxRoutes = new Hono<AppEnv>();
