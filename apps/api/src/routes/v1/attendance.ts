/** Member routes: the attendance check ("did the client come?"). */
import { Hono } from 'hono';

import { parseJson } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';
import { idParam } from './context.ts';
import { answerAttendanceSchema } from './schemas.ts';

export const attendanceRoutes = new Hono<AppEnv>();

/** The caller's open questions (their own; owners also get owner-mode and escalated ones). */
attendanceRoutes.get('/attendance/pending', async (c) => {
  const { attendance } = c.get('container');
  const { userId, role, businessId } = c.get('auth');
  return c.json({ data: await attendance.listPending({ userId, role, businessId }) });
});

/** The recipient or an owner answers; sets completed / no_show through BookingService. */
attendanceRoutes.post('/attendance/:checkId/answer', async (c) => {
  const { attendance } = c.get('container');
  const { userId, role, businessId } = c.get('auth');
  const checkId = idParam(c, 'checkId');
  const { outcome } = await parseJson(c, answerAttendanceSchema);
  return c.json({ data: await attendance.answer({ userId, role, businessId }, checkId, outcome) });
});
