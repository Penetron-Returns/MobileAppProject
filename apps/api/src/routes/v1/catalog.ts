/** Owner-only catalog management: services, staff, staff services/availability, overrides. */
import { Hono } from 'hono';

import {
  createOverride,
  createService,
  createStaff,
  deleteOverride,
  deleteService,
  deleteStaff,
  replaceStaffAvailability,
  replaceStaffServices,
  updateService,
  updateStaff,
} from '../../booking/admin.ts';
import { parseJson } from '../../lib/validation.ts';
import { requireOwner } from '../../middleware/auth.ts';
import type { AppEnv } from '../../types.ts';
import { deps, idParam } from './context.ts';
import {
  createOverrideSchema,
  createServiceSchema,
  createStaffSchema,
  staffAvailabilitySchema,
  staffServicesSchema,
  updateServiceSchema,
  updateStaffSchema,
} from './schemas.ts';

export const catalogRoutes = new Hono<AppEnv>();

// ----- services -----

catalogRoutes.post('/services', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, createServiceSchema);
  return c.json({ data: await createService(repo, auth.businessId, body) }, 201);
});

catalogRoutes.patch('/services/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, updateServiceSchema);
  return c.json({ data: await updateService(repo, auth.businessId, id, body) });
});

catalogRoutes.delete('/services/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  return c.json({ data: await deleteService(repo, auth.businessId, idParam(c)) });
});

// ----- staff -----

catalogRoutes.post('/staff', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, createStaffSchema);
  return c.json({ data: await createStaff(repo, auth.businessId, body) }, 201);
});

catalogRoutes.patch('/staff/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, updateStaffSchema);
  return c.json({ data: await updateStaff(repo, auth.businessId, id, body) });
});

catalogRoutes.delete('/staff/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  return c.json({ data: await deleteStaff(repo, auth.businessId, idParam(c)) });
});

catalogRoutes.put('/staff/:id/services', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const { service_ids } = await parseJson(c, staffServicesSchema);
  return c.json({ data: await replaceStaffServices(repo, auth.businessId, id, service_ids) });
});

catalogRoutes.put('/staff/:id/availability', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const { rules } = await parseJson(c, staffAvailabilitySchema);
  return c.json({ data: await replaceStaffAvailability(repo, auth.businessId, id, rules) });
});

// ----- overrides -----

catalogRoutes.post('/overrides', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  const body = await parseJson(c, createOverrideSchema);
  return c.json({ data: await createOverride(repo, auth.businessId, body) }, 201);
});

catalogRoutes.delete('/overrides/:id', requireOwner, async (c) => {
  const { repo, auth } = deps(c);
  return c.json({ data: await deleteOverride(repo, auth.businessId, idParam(c)) });
});
