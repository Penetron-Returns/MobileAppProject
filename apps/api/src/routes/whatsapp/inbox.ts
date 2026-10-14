/**
 * Staff inbox (mounted at /v1 behind requireAuth() + idempotency()):
 * reply inside the 24h window, release a thread to the bot, resolve an
 * escalation. Any member may act; everything is scoped by business.
 */
import { Hono, type Context } from 'hono';

import { parseJson } from '../../lib/validation.ts';
import { requireFeature } from '../../middleware/feature.ts';
import type { AppEnv } from '../../types.ts';
import { getWaDeps } from '@booking/app-store/whatsapp/deps.ts';
import { releaseConversation, resolveEscalation, sendStaffMessage } from '@booking/app-store/whatsapp/inbox.ts';
import { idParam, parseOptionalJson } from '../v1/context.ts';
import { resolveEscalationSchema, staffMessageSchema } from './schemas.ts';

export const v1InboxRoutes = new Hono<AppEnv>();

// Mounted at /v1 beside other routers, so scope by path rather than '*'.
v1InboxRoutes.use('/conversations/*', requireFeature('inbox'));
v1InboxRoutes.use('/escalations/*', requireFeature('inbox'));

const waDeps = (c: Context<AppEnv>) => getWaDeps(c.get('container'), c.get('logger'));

v1InboxRoutes.post('/conversations/:id/messages', async (c) => {
  const conversationId = idParam(c);
  const body = await parseJson(c, staffMessageSchema);
  const { businessId, userId } = c.get('auth');
  const data = await sendStaffMessage(waDeps(c), { businessId, conversationId, userId, text: body.text });
  return c.json({ data }, 201);
});

v1InboxRoutes.post('/conversations/:id/release', async (c) => {
  const conversationId = idParam(c);
  const { businessId, userId } = c.get('auth');
  return c.json({ data: await releaseConversation(waDeps(c), { businessId, conversationId, userId }) });
});

v1InboxRoutes.post('/escalations/:id/resolve', async (c) => {
  const escalationId = idParam(c);
  const body = await parseOptionalJson(c, resolveEscalationSchema);
  const { businessId, userId } = c.get('auth');
  return c.json({ data: await resolveEscalation(waDeps(c), { businessId, escalationId, userId, note: body.note ?? null }) });
});
