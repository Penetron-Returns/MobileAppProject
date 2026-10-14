/**
 * /v1/whatsapp: channel status and onboarding. Mounted behind requireAuth()
 * + idempotency(); every mutation is owner-only. Tokens are never returned.
 */
import { Hono, type Context } from 'hono';

import { requireOwner } from '../../middleware/auth.ts';
import { requireFeature } from '../../middleware/feature.ts';
import { parseJson } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { APPS } from '@booking/app-store/_registry.ts';
import { getWaDeps } from '@booking/app-store/whatsapp/deps.ts';
import {
  completeEmbeddedSignup,
  connectWithToken,
  disconnectAccount,
  getChannelStatus,
  pauseAccount,
  resumeAccount,
  sendTestMessage,
  syncAccount,
} from '@booking/app-store/whatsapp/onboarding.ts';
import { embeddedSignupSchema, manualConnectSchema, testMessageSchema } from './schemas.ts';

export const v1WhatsAppRoutes = new Hono<AppEnv>();

// Our own deterministic WhatsApp integration: Free-plan feature only (Nerova owns WhatsApp on paid plans).
v1WhatsAppRoutes.use('*', requireFeature(APPS.whatsapp.requiredFeature));

const waDeps = (c: Context<AppEnv>) => getWaDeps(c.get('container'), c.get('logger'));

v1WhatsAppRoutes.get('/', async (c) => c.json({ data: await getChannelStatus(waDeps(c), c.get('auth').businessId) }));

v1WhatsAppRoutes.post('/embedded-signup', requireOwner, async (c) => {
  const body = await parseJson(c, embeddedSignupSchema);
  const data = await completeEmbeddedSignup(waDeps(c), {
    businessId: c.get('auth').businessId,
    code: body.code,
    wabaId: body.waba_id,
    phoneNumberId: body.phone_number_id,
  });
  return c.json({ data });
});

v1WhatsAppRoutes.post('/connect', requireOwner, async (c) => {
  const body = await parseJson(c, manualConnectSchema);
  const data = await connectWithToken(waDeps(c), {
    businessId: c.get('auth').businessId,
    accessToken: body.access_token,
    wabaId: body.waba_id,
    phoneNumberId: body.phone_number_id,
  });
  return c.json({ data });
});

v1WhatsAppRoutes.post('/sync', requireOwner, async (c) =>
  c.json({ data: await syncAccount(waDeps(c), c.get('auth').businessId) }),
);

v1WhatsAppRoutes.post('/pause', requireOwner, async (c) => c.json({ data: await pauseAccount(waDeps(c), c.get('auth').businessId) }));

v1WhatsAppRoutes.post('/resume', requireOwner, async (c) => c.json({ data: await resumeAccount(waDeps(c), c.get('auth').businessId) }));

v1WhatsAppRoutes.post('/disconnect', requireOwner, async (c) =>
  c.json({ data: await disconnectAccount(waDeps(c), c.get('auth').businessId) }),
);

v1WhatsAppRoutes.post('/test-message', requireOwner, async (c) => {
  const body = await parseJson(c, testMessageSchema);
  return c.json({ data: await sendTestMessage(waDeps(c), c.get('auth').businessId, body.to) });
});
