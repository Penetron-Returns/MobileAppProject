/**
 * Owner chat session (member) and WhatsApp setup (owner) for the Nerova companion, all gated on feature `companion`:
 * POST /v1/companion/session, GET /v1/companion/setup, GET /v1/companion/whatsapp-health, POST /v1/companion/whatsapp/connect-session.
 */
import { APP_ID_HEADER } from '@booking/companion/nerova/nativeApps.ts';
import { Hono } from 'hono';

import { parseJson } from '../../lib/validation.ts';
import { requireOwner } from '../../middleware/auth.ts';
import { requireFeature } from '../../middleware/feature.ts';
import type { AppEnv } from '../../types.ts';
import { companionSettingsPatchSchema, connectWhatsAppSessionSchema, createCompanionSessionSchema } from './schemas.ts';

export const companionRoutes = new Hono<AppEnv>();

companionRoutes.post('/companion/session', requireFeature('companion'), async (c) => {
  const { color_mode, platform } = await parseJson(c, createCompanionSessionSchema);
  const { businessId, userId } = c.get('auth');
  const session = await c.get('container').companion.createSession(businessId, { ownerReference: userId, colorMode: color_mode, platform, appId: c.req.header(APP_ID_HEADER) });
  return c.json({ data: session });
});

companionRoutes.get('/companion/setup', requireOwner, requireFeature('companion'), async (c) => {
  const setup = await c.get('container').companion.getSetup(c.get('auth').businessId);
  return c.json({ data: setup });
});

// Any member may read the number's health (no secrets in it); Nerova's whatsapp-health, else the setup read.
companionRoutes.get('/companion/whatsapp-health', requireFeature('companion'), async (c) => {
  return c.json({ data: await c.get('container').companion.getWhatsAppHealth(c.get('auth').businessId) });
});

// The launch URL carries a secret `#state=`: it is returned as-is and never logged.
companionRoutes.post('/companion/whatsapp/connect-session', requireOwner, requireFeature('companion'), async (c) => {
  // The body is optional (an empty body is `{}`).
  // Hono caches the body, so reading text here and again in parseJson is safe.
  const hasBody = (await c.req.text()).trim().length > 0;
  const { return_url } = hasBody ? await parseJson(c, connectWhatsAppSessionSchema) : {};
  const session = await c.get('container').companion.createWhatsAppConnectSession(c.get('auth').businessId, { returnUrl: return_url, appId: c.req.header(APP_ID_HEADER) });
  return c.json({ data: session }, 201);
});

// Nerova companion settings (approval policy, undo window): owner only, Clerk session only (never a device token).
companionRoutes.get('/companion/settings', requireOwner, requireFeature('companion'), async (c) => {
  return c.json({ data: await c.get('container').companionSettings.get(c.get('auth').businessId) });
});

companionRoutes.patch('/companion/settings', requireOwner, requireFeature('companion'), async (c) => {
  const patch = await parseJson(c, companionSettingsPatchSchema);
  const { businessId, userId } = c.get('auth');
  // The idempotency middleware has already required the header; it is forwarded to Nerova.
  const key = c.req.header('idempotency-key') ?? '';
  const data = await c.get('container').companionSettings.update({ businessId, userId, requestId: c.get('requestId') }, patch, key);
  return c.json({ data });
});
