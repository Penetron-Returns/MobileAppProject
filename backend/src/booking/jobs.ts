/**
 * Daily cleanup (POST /cron/cleanup): expire idempotency keys, prune
 * processed webhook events older than 30 days, and mark web booking
 * attempts still in progress after 2 hours as abandoned. Steps run
 * independently: one failing step is logged and counted in `failed_steps`
 * without blocking the others. These queries are global by design.
 */
import type { Container } from '../container';
import { createLogger } from '../lib/logger';
import { getBookingRepository } from './index';

export const WEBHOOK_RETENTION_DAYS = 30;
export const WEB_ATTEMPT_TIMEOUT_MINUTES = 120;

const DAY = 86_400_000;
const MINUTE = 60_000;

export async function runCleanupJob(container: Container, now: Date = new Date()): Promise<Record<string, number>> {
  const logger = createLogger({ job: 'cleanup' });
  const repo = getBookingRepository(container);
  const steps: [string, () => Promise<number>][] = [
    ['idempotency_keys_deleted', () => repo.deleteExpiredIdempotencyKeys(now.toISOString())],
    [
      'webhook_events_pruned',
      () => repo.pruneProcessedWebhookEvents(new Date(now.getTime() - WEBHOOK_RETENTION_DAYS * DAY).toISOString()),
    ],
    [
      'attempts_abandoned',
      () => repo.abandonStaleAttempts('web', new Date(now.getTime() - WEB_ATTEMPT_TIMEOUT_MINUTES * MINUTE).toISOString()),
    ],
  ];

  const result: Record<string, number> = { failed_steps: 0 };
  for (const [name, run] of steps) {
    try {
      result[name] = await run();
    } catch (error) {
      result[name] = 0;
      result.failed_steps! += 1;
      logger.error('cleanup_step_failed', { step: name, error });
    }
  }
  return result;
}
