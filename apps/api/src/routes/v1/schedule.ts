/**
 * Hours and availability configuration: special days, staff breaks, staff time off, and the one-call config
 * and conflict-preview reads. Writes are owner-only (the Idempotency-Key middleware is applied in app.ts).
 */
import { Hono } from 'hono';

import { getAvailabilityConfig, getAvailabilityConflicts } from '@booking/features/availability/services/config.ts';
import {
  createSpecialDay,
  deleteSpecialDay,
  suggestSpecialDays,
  updateSpecialDay,
} from '@booking/features/availability/services/specialDays.ts';
import {
  createStaffTimeOff,
  deleteStaffTimeOff,
  replaceStaffBreaks,
  updateStaffTimeOff,
} from '@booking/features/availability/services/staffSchedule.ts';
import type { AvailabilityConflictsResponse } from '@booking/types';
import { parseJson, parseQuery } from '../../lib/validation.ts';
import { requireOwner } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types.ts';
import { deps, idParam } from './context.ts';
import {
  configQuerySchema,
  conflictsQuerySchema,
  createSpecialDaySchema,
  createTimeOffSchema,
  replaceBreaksSchema,
  suggestionsQuerySchema,
  updateSpecialDaySchema,
  updateTimeOffSchema,
} from './scheduleSchemas.ts';

export const scheduleRoutes = new Hono<AppEnv>();

// ----- reads (any member) -----

scheduleRoutes.get('/availability/config', async (c) => {
  const { repo, auth } = deps(c);
  const q = parseQuery(c, configQuerySchema);
  return c.json({ data: await getAvailabilityConfig(repo, auth.businessId, q) });
});

scheduleRoutes.get('/availability/conflicts', async (c) => {
  const { repo, auth } = deps(c);
  const q = parseQuery(c, conflictsQuerySchema);
  const conflicts = await getAvailabilityConflicts(repo, auth.businessId, {
    staffId: q.staff_id,
    from: q.from,
    to: q.to,
    startTime: q.start_time,
    endTime: q.end_time,
    mode: q.mode,
  });
  return c.json({ data: { conflicts } satisfies AvailabilityConflictsResponse });
});

scheduleRoutes.get('/special-days/suggestions', async (c) => {
  const { repo, auth } = deps(c);
  const { year } = parseQuery(c, suggestionsQuerySchema);
  return c.json({ data: await suggestSpecialDays(repo, auth.businessId, year) });
});

// ----- special days (owner) -----

scheduleRoutes.post('/special-days', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, createSpecialDaySchema);
  return c.json({ data: await createSpecialDay(repo, auth.businessId, body) }, 201);
});

scheduleRoutes.patch('/special-days/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, updateSpecialDaySchema);
  return c.json({ data: await updateSpecialDay(repo, auth.businessId, idParam(c), body) });
});

scheduleRoutes.delete('/special-days/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  return c.json({ data: await deleteSpecialDay(repo, auth.businessId, idParam(c)) });
});

// ----- staff breaks and time off (owner) -----

scheduleRoutes.put('/staff/:id/breaks', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, replaceBreaksSchema);
  return c.json({ data: await replaceStaffBreaks(repo, auth.businessId, id, body) });
});

scheduleRoutes.post('/staff/:id/time-off', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, createTimeOffSchema);
  return c.json({ data: await createStaffTimeOff(repo, auth.businessId, id, body) }, 201);
});

scheduleRoutes.patch('/time-off/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, updateTimeOffSchema);
  return c.json({ data: await updateStaffTimeOff(repo, auth.businessId, idParam(c), body) });
});

scheduleRoutes.delete('/time-off/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  return c.json({ data: await deleteStaffTimeOff(repo, auth.businessId, idParam(c)) });
});
