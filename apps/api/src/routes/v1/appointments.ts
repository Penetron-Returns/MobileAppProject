/** Member routes: appointment lifecycle. */
import { Hono } from 'hono';

import {
  checkInAppointment,
  updateAppointmentNotes,
} from '@booking/features/bookings/services/appointmentExtras.ts';
import { upsertClient } from '@booking/features/clients/services/clients.ts';
import { notFound } from '@booking/features/lib/errors.ts';
import { parseJson } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { deps, idParam, parseOptionalJson, rpcIdempotencyKey } from './context.ts';
import { cancelSchema, createAppointmentSchema, rescheduleSchema, statusSchema, updateAppointmentSchema } from './schemas.ts';

export const appointmentRoutes = new Hono<AppEnv>();

appointmentRoutes.post('/appointments', async (c) => {
  const { repo, booking, auth, actor } = deps(c);
  const body = await parseJson(c, createAppointmentSchema);

  let clientId = body.client_id;
  if (body.new_client) {
    clientId = (await upsertClient(repo, auth.businessId, body.new_client)).id;
  } else if (!(await repo.getClient(auth.businessId, clientId!))) {
    throw notFound('Client');
  }

  const appointment = await booking.createAppointment({
    businessId: auth.businessId,
    clientId: clientId!,
    serviceId: body.service_id,
    staffId: body.staff_id ?? null,
    startsAt: body.starts_at,
    source: 'app',
    idempotencyKey: rpcIdempotencyKey(c, 'app'),
    actor,
    notes: body.notes ?? null,
    allowOutsideHours: body.allow_outside_hours ?? false,
    notifyCustomer: body.send_whatsapp_confirmation ?? true,
  });
  return c.json({ data: appointment }, 201);
});

appointmentRoutes.post('/appointments/:id/reschedule', async (c) => {
  const { booking, auth, actor } = deps(c);
  const id = idParam(c);
  const body = await parseJson(c, rescheduleSchema);
  const appointment = await booking.rescheduleAppointment({
    businessId: auth.businessId,
    appointmentId: id,
    startsAt: body.starts_at,
    staffId: body.staff_id ?? null,
    actor,
    notifyCustomer: body.notify_customer ?? true,
  });
  return c.json({ data: appointment });
});

appointmentRoutes.post('/appointments/:id/cancel', async (c) => {
  const { booking, auth, actor } = deps(c);
  const id = idParam(c);
  const body = await parseOptionalJson(c, cancelSchema);
  const appointment = await booking.cancelAppointment({
    businessId: auth.businessId,
    appointmentId: id,
    actor,
    reason: body.reason ?? null,
    notifyCustomer: body.notify_customer ?? true,
  });
  return c.json({ data: appointment });
});

appointmentRoutes.post('/appointments/:id/status', async (c) => {
  const { booking, auth, actor } = deps(c);
  const id = idParam(c);
  const { status } = await parseJson(c, statusSchema);
  return c.json({ data: await booking.setAppointmentStatus(auth.businessId, id, status, actor) });
});

appointmentRoutes.post('/appointments/:id/check-in', async (c) => {
  const { repo, auth } = deps(c);
  return c.json({ data: await checkInAppointment(repo, auth.businessId, idParam(c), auth.userId) });
});

appointmentRoutes.patch('/appointments/:id', async (c) => {
  const { repo, auth } = deps(c);
  const id = idParam(c);
  const { notes } = await parseJson(c, updateAppointmentSchema);
  return c.json({ data: await updateAppointmentNotes(repo, auth.businessId, id, notes) });
});
