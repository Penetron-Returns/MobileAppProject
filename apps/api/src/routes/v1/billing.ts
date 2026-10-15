/** GET /v1/billing/usage, GET /v1/plans (any member). */
import { Hono } from 'hono';

import { parseQuery } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { monthQuerySchema } from './schemas.ts';

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.get('/billing/usage', async (c) => {
  const { month } = parseQuery(c, monthQuerySchema);
  return c.json({ data: await c.get('container').usage.getUsage(c.get('auth').businessId, month) });
});

billingRoutes.get('/plans', async (c) => c.json({ data: await c.get('container').usage.listPlans(c.get('auth').businessId) }));
