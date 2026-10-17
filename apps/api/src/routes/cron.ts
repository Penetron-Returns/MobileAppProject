import { Hono } from 'hono';
import { z } from 'zod';

import { runCleanupJob } from '@booking/features/bookings/services/cleanupJob.ts';
import type { Container } from '../container.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { AppEnv } from '../types.ts';
import {
  runConversationExpiryJob,
  runRemindersJob,
  runTokenRefreshJob,
  runWabaHealthJob,
} from '@booking/app-store/whatsapp/jobs.ts';
import { runHeldClientNotificationsJob } from '@booking/app-store/whatsapp/heldNotifications.ts';

/** `query` is the request's query string; only jobs that take options read it. */
type Job = (container: Container, now?: Date, query?: Record<string, string>) => Promise<Record<string, number>>;

/**
 * Keep-warm ping (every minute, see migration 20261020000001). Does no I/O: reaching this handler already
 * loaded the function bundle and built the container, which is the cold-start cost being avoided.
 */
const runWarmJob: Job = async () => ({});

/** Attendance check (every 5 minutes, see migration 20261021000002): questions, pushes, escalation, summaries. */
const runAttendanceJob: Job = (container, now) => container.attendance.runJob(now);

/** Stories (every 15 minutes, migration 20261027000003): Brief, Client updates and Business update, see docs/stories.md. */
const runStoriesJob: Job = (container, now, query = {}) => {
  const force = query.force === '1' || query.force === 'true';
  const businessId = query.businessId;
  if (businessId !== undefined && !z.uuid().safeParse(businessId).success) throw new AppError('VALIDATION_FAILED', 'businessId must be a UUID');
  return container.stories.runJob(now, { force, ...(businessId ? { businessId } : {}) });
};

export const CRON_JOBS: Record<string, Job> = {
  reminders: runRemindersJob,
  'conversation-expiry': runConversationExpiryJob,
  'waba-health': runWabaHealthJob,
  'token-refresh': runTokenRefreshJob,
  cleanup: runCleanupJob,
  warm: runWarmJob,
  attendance: runAttendanceJob,
  /** Act-then-undo (every minute, migration 20261026000003): sends held client messages once the undo window has passed. */
  'client-notifications': runHeldClientNotificationsJob,
  stories: runStoriesJob,
};

/** Mounted at /cron behind requireCronSecret. GET is also accepted for manual triggering. */
export const cronRoutes = new Hono<AppEnv>();

cronRoutes.on(['GET', 'POST'], '/:job', async (c) => {
  const name = c.req.param('job');
  const job = CRON_JOBS[name];
  if (!job) throw new AppError('NOT_FOUND', `Unknown cron job ${name}`);
  const started = Date.now();
  const result = await job(c.get('container'), undefined, c.req.query());
  c.get('logger').info('cron_job', { job: name, duration_ms: Date.now() - started, ...result });
  return c.json({ data: { job: name, result } });
});
