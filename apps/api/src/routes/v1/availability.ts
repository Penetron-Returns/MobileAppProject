/** Member routes: live availability (never cached). */
import { Hono } from 'hono';

import type { AvailableDaysResponse } from '@booking/types';
import { parseQuery } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { deps } from './context.ts';
import { daysQuerySchema, slotsQuerySchema } from './schemas.ts';

export const availabilityRoutes = new Hono<AppEnv>();

availabilityRoutes.get('/availability/days', async (c) => {
  const { booking, auth } = deps(c);
  const q = parseQuery(c, daysQuerySchema);
  const days = await booking.listAvailableDays({
    businessId: auth.businessId,
    serviceId: q.service_id,
    staffId: q.staff_id ?? null,
    from: q.from,
    to: q.to,
  });
  return c.json({ data: { days } satisfies AvailableDaysResponse });
});

availabilityRoutes.get('/availability/slots', async (c) => {
  const { booking, auth } = deps(c);
  const q = parseQuery(c, slotsQuerySchema);
  const data = await booking.listAvailableSlots({
    businessId: auth.businessId,
    serviceId: q.service_id,
    staffId: q.staff_id ?? null,
    date: q.date,
  });
  return c.json({ data });
});
