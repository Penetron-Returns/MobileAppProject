/** POST /v1/companion/session: an owner chat session for the Nerova companion (feature `companion`). */
import { Hono } from 'hono';

import { parseJson } from '../../lib/validation.ts';
import { requireFeature } from '../../middleware/feature.ts';
import type { AppEnv } from '../../types.ts';
import { createCompanionSessionSchema } from './schemas.ts';

export const companionRoutes = new Hono<AppEnv>();

companionRoutes.post('/companion/session', requireFeature('companion'), async (c) => {
  const { color_mode } = await parseJson(c, createCompanionSessionSchema);
  const { businessId, userId } = c.get('auth');
  const session = await c.get('container').companion.createSession(businessId, { ownerReference: userId, colorMode: color_mode });
  return c.json({ data: session });
});
