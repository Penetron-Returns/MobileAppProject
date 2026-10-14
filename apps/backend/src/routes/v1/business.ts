/** /v1/me, /v1/business, /v1/business/hours, /v1/devices */
import { Hono } from 'hono';

import { getMe, registerDevice, replaceBusinessHours, updateBusiness } from '../../booking/admin.ts';
import { parseJson } from '../../lib/validation.ts';
import { requireOwner } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types.ts';
import { deps } from './context.ts';
import { registerDeviceSchema, replaceHoursSchema, updateBusinessSchema } from './schemas.ts';

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
  await c.get('container').nerovaEvents.accountChanged(auth.businessId, 'account.updated');
  return c.json({ data: business });
});

businessRoutes.put('/business/hours', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const { hours } = await parseJson(c, replaceHoursSchema);
  const saved = await replaceBusinessHours(repo, auth.businessId, hours);
  await c.get('container').nerovaEvents.accountChanged(auth.businessId, 'account.updated');
  return c.json({ data: { hours: saved } });
});

businessRoutes.post('/devices', async (c) => {
  const { repo, auth } = deps(c);
  const { token, platform } = await parseJson(c, registerDeviceSchema);
  return c.json({ data: await registerDevice(repo, auth.businessId, auth.userId, token, platform) }, 201);
});
