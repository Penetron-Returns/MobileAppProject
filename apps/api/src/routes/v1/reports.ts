/** GET /v1/reports/summary: the monthly booking figures for the caller's business. */
import { Hono } from 'hono';

import { parseQuery } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { monthQuerySchema } from './schemas.ts';

export const reportsRoutes = new Hono<AppEnv>();

reportsRoutes.get('/reports/summary', async (c) => {
  const { month } = parseQuery(c, monthQuerySchema);
  const { reports } = c.get('container');
  return c.json({ data: await reports.getReport(c.get('auth').businessId, month) });
});
