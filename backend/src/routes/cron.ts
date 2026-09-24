import { Hono } from 'hono';

import { runCleanupJob } from '../booking/jobs';
import type { Container } from '../container';
import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';
import {
  runConversationExpiryJob,
  runRemindersJob,
  runTokenRefreshJob,
  runWabaHealthJob,
} from '../whatsapp/jobs';

type Job = (container: Container, now?: Date) => Promise<Record<string, number>>;

export const CRON_JOBS: Record<string, Job> = {
  reminders: runRemindersJob,
  'conversation-expiry': runConversationExpiryJob,
  'waba-health': runWabaHealthJob,
  'token-refresh': runTokenRefreshJob,
  cleanup: runCleanupJob,
};

/** Mounted at /cron behind requireCronSecret. GET is accepted for Vercel Cron. */
export const cronRoutes = new Hono<AppEnv>();

cronRoutes.on(['GET', 'POST'], '/:job', async (c) => {
  const name = c.req.param('job');
  const job = CRON_JOBS[name];
  if (!job) throw new AppError('NOT_FOUND', `Unknown cron job ${name}`);
  const started = Date.now();
  const result = await job(c.get('container'));
  c.get('logger').info('cron_job', { job: name, duration_ms: Date.now() - started, ...result });
  return c.json({ data: { job: name, result } });
});
