/** /v1/me, /v1/business, /v1/business/hours, /v1/devices */
import { Hono, type Context } from 'hono';

import { getMe, replaceBusinessHours, updateBusiness } from '@booking/features/catalog/services/catalog.ts';
import { registerDevice } from '@booking/features/team/services/devices.ts';
import { runInBackground } from '../../lib/background.ts';
import { parseJson } from '../../lib/validation.ts';
import { requireOwner } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types.ts';
import { deps } from './context.ts';
import { registerDeviceSchema, replaceHoursSchema, updateBusinessSchema } from './schemas.ts';

/** Tells Nerova to re-read the account; best effort, never part of the owner's request. */
function announceAccountUpdated(c: Context<AppEnv>, businessId: string) {
  const { nerovaEvents } = c.get('container');
  runInBackground(() => nerovaEvents.accountChanged(businessId, 'account.updated'), c.get('logger'), 'nerova_event_failed');
}

export const businessRoutes = new Hono<AppEnv>();

businessRoutes.get('/me', async (c) => {
  const { repo, auth } = deps(c);
  const entitlements = await c.get('container').entitlements.getEntitlements(auth.businessId);
  return c.json({ data: await getMe(repo, auth, entitlements) });
});

businessRoutes.patch('/business', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, updateBusinessSchema);
  const business = await updateBusiness(repo, auth.businessId, body);
  announceAccountUpdated(c, auth.businessId);
  return c.json({ data: business });
});

businessRoutes.put('/business/hours', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const { hours } = await parseJson(c, replaceHoursSchema);
  const saved = await replaceBusinessHours(repo, auth.businessId, hours);
  announceAccountUpdated(c, auth.businessId);
  return c.json({ data: { hours: saved } });
});

businessRoutes.post('/devices', async (c) => {
  const { repo, auth } = deps(c);
  const { token, platform } = await parseJson(c, registerDeviceSchema);
  return c.json({ data: await registerDevice(repo, auth.businessId, auth.userId, token, platform) }, 201);
});
