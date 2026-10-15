/** GET /v1/reports/summary: our own numbers plus, when available, what the companion did (feature `reports`). */
import { Hono } from 'hono';

import { parseQuery } from '../../lib/validation.ts';
import { requireFeature } from '../../middleware/feature.ts';
import type { AppEnv } from '../../types.ts';
import { monthQuerySchema } from './schemas.ts';

export const reportsRoutes = new Hono<AppEnv>();

reportsRoutes.get('/reports/summary', requireFeature('reports'), async (c) => {
  const { month } = parseQuery(c, monthQuerySchema);
  const { usage, companion } = c.get('container');
  const { businessId } = c.get('auth');
  const report = await usage.getReport(businessId, month);
  // Nerova's half is best effort: its outage must never take the report down.
  return c.json({ data: { ...report, companion: await companion.getOutcomes(businessId, report.month) } });
});
