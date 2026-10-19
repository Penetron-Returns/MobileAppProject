/**
 * Nerova webhook, mounted at /webhooks/nerova. Standard Webhooks signature (NEROVA_WEBHOOK_SECRET) is checked on
 * the raw body before parsing; a bad signature is 401, an unset secret is 503. Deliveries are deduplicated in
 * webhook_events (source 'nerova', event_key = webhook-id). It answers 200 at once and pushes in the background:
 * Nerova retries a non-2xx for ~21 hours, so a failed push is logged, not retried. `approval.requested` and
 * `action.executed` (act-then-undo) push the owners; `action.undone` is only logged. `channel.health_changed` is
 * acknowledged and logged (enum values only, no PII): nothing is stored and no push is sent, the app refetches
 * the setup (which carries the health) on focus and pull-to-refresh. `escalation.raised` / `escalation.resolved` with
 * source `owner_support` open / close a row in `support_requests` (a malformed one is a 400; other sources are only
 * logged). Everything else is ignored.
 */
import { Hono } from 'hono';
import type { z } from 'zod';

import { createSupabaseAttendanceRepository } from '@booking/features/attendance/index.ts';
import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { createLogger } from '@booking/features/lib/logger.ts';
import { notifyActionExecuted, type ActionExecutedObject, type ActionPushDeps } from '@booking/companion/approvals/actionPush.ts';
import { createActionsClientFromEnv } from '@booking/companion/nerova/actions.ts';
import { notifyApprovalRequested, type ApprovalPushDeps, type ApprovalRequestedObject } from '@booking/companion/approvals/approvalPush.ts';
import { createApprovalsClientFromEnv } from '@booking/companion/nerova/approvals.ts';
import { parseWhatsAppHealth } from '@booking/companion/nerova/whatsappHealth.ts';
import {
  isOwnerSupport,
  notifyOwnerSupportReceived,
  openSupportRequest,
  resolveSupportRequests,
  supportRaisedSchema,
  supportResolvedSchema,
  type SupportDeps,
} from '@booking/companion/support/supportEscalation.ts';
import { createSupabaseSupportRepository } from '@booking/features/support/repository.ts';
import { verifyStandardWebhook } from '@booking/companion/webhooks/verifyStandardWebhook.ts';
import { createPushSender } from '@booking/app-store/whatsapp/notifications/push.ts';
import type { Container } from '../container.ts';
import { runInBackground } from '../lib/background.ts';
import type { AppEnv } from '../types.ts';

/** Tests inject `approvalPush` on the container; production builds it from the environment per request. */
type ApprovalContainer = Container & { approvalPush?: ApprovalPushDeps; actionPush?: ActionPushDeps; supportDeps?: SupportDeps };

function supportDeps(container: ApprovalContainer): SupportDeps {
  if (container.supportDeps) return container.supportDeps;
  const { push, logger } = approvalPushDeps(container);
  return { repo: createSupabaseSupportRepository(container.db), push, logger, clock: container.clock };
}

type SupportEvent =
  | { type: 'escalation.raised'; event: z.infer<typeof supportRaisedSchema> }
  | { type: 'escalation.resolved'; event: z.infer<typeof supportResolvedSchema> };

/** A recognised support event whose body is malformed is a 400 (nothing is stored); other sources return null. */
function parseSupport(type: string, object: Record<string, unknown>): SupportEvent | null {
  if ((type !== 'escalation.raised' && type !== 'escalation.resolved') || !isOwnerSupport(object)) return null;
  const schema = type === 'escalation.raised' ? supportRaisedSchema : supportResolvedSchema;
  if (!schema.safeParse(object).success) throw new AppError('VALIDATION_FAILED', 'Unexpected support escalation payload');
  return type === 'escalation.raised'
    ? { type, event: supportRaisedSchema.parse(object) }
    : { type, event: supportResolvedSchema.parse(object) };
}

function approvalPushDeps(container: ApprovalContainer): ApprovalPushDeps {
  if (container.approvalPush) return container.approvalPush;
  const repo = createSupabaseAttendanceRepository(container.db);
  const logger = createLogger({ module: 'approval_push' });
  return {
    approvals: createApprovalsClientFromEnv(container.env),
    repo,
    push: createPushSender({
      listUserTokens: async (businessId, userIds) => (await repo.listDeviceTokens(businessId, userIds)).map((d) => d.token),
      accessToken: container.env.EXPO_ACCESS_TOKEN,
      logger,
    }),
    logger,
  };
}

function actionPushDeps(container: ApprovalContainer): ActionPushDeps {
  if (container.actionPush) return container.actionPush;
  const { repo, push, logger } = approvalPushDeps(container);
  return { actions: createActionsClientFromEnv(container.env), repo, push, logger, clock: container.clock };
}

interface Envelope {
  type: string;
  object: Record<string, unknown>;
}

function parseEnvelope(raw: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Webhook body must be JSON');
  }
  const event = parsed as { type?: unknown; data?: { object?: unknown } } | null;
  const object = event?.data?.object;
  if (!event || typeof event.type !== 'string' || typeof object !== 'object' || object === null) {
    throw new AppError('VALIDATION_FAILED', 'Unexpected webhook payload');
  }
  return { type: event.type, object: object as Record<string, unknown> };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function toApprovalRequested(object: Record<string, unknown>): ApprovalRequestedObject | null {
  const accountId = str(object.accountId);
  const approvalId = str(object.approvalId);
  if (!accountId || !approvalId) return null;
  return { accountId, approvalId, kind: str(object.kind) ?? '', expiresAt: str(object.expiresAt), externalReference: str(object.externalReference) };
}

function toActionExecuted(object: Record<string, unknown>): ActionExecutedObject | null {
  const actionId = str(object.actionId);
  const accountId = str(object.accountId);
  if (!actionId || !accountId) return null;
  return { accountId, actionId, kind: str(object.kind) ?? '', executedAt: str(object.executedAt), undoUntil: str(object.undoUntil), externalReference: str(object.externalReference) };
}

export const nerovaWebhookRoutes = new Hono<AppEnv>();

nerovaWebhookRoutes.post('/', async (c) => {
  const container = c.get('container') as ApprovalContainer;
  const logger = c.get('logger');
  const secret = container.env.NEROVA_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: { code: 'NOT_CONFIGURED', message: 'Nerova webhook is not configured' } }, 503);

  const raw = await c.req.text();
  const webhookId = c.req.header('webhook-id') ?? '';
  const verdict = verifyStandardWebhook(
    secret,
    raw,
    { id: webhookId, timestamp: c.req.header('webhook-timestamp'), signature: c.req.header('webhook-signature') },
    container.clock(),
  );
  if (!verdict.ok) {
    logger.warn('nerova_webhook_rejected', { reason: verdict.reason });
    throw new AppError('UNAUTHENTICATED', 'Invalid webhook signature');
  }

  const envelope = parseEnvelope(raw);
  const support = parseSupport(envelope.type, envelope.object);
  const repo = getBookingRepository(container);
  // Only the type and approval id are stored: no card text, no customer detail ever reaches us anyway.
  const { row, duplicate } = await repo.recordWebhookEvent('nerova', webhookId, {
    type: envelope.type,
    approval_id: str(envelope.object.approvalId),
    action_id: str(envelope.object.actionId),
  });
  if (duplicate && row.processed_at) return c.json({ data: { status: 'duplicate' } });

  if (envelope.type.startsWith('escalation.') && !support) {
    logger.info('nerova_escalation_ignored', { type: envelope.type, source: str(envelope.object.source) });
  }
  if (support) {
    const deps = supportDeps(container);
    let businessId: string | null = null;
    try {
      if (support.type === 'escalation.raised') {
        businessId = (await openSupportRequest(deps, support.event)).businessId;
      } else {
        await resolveSupportRequests(deps, support.event);
      }
    } catch (error) {
      // 500 so Nerova retries; the event stays unprocessed so the retry is not treated as a duplicate.
      await repo.finishWebhookEvent(row.id, { processedAt: null, error: 'SUPPORT_FAILED', attempts: row.attempts + 1 }).catch(() => undefined);
      throw error;
    }
    await repo.finishWebhookEvent(row.id, { processedAt: new Date().toISOString(), error: null, attempts: row.attempts + 1 });
    if (businessId) runInBackground(() => notifyOwnerSupportReceived(deps, businessId as string), logger, 'nerova_support_push_failed');
    return c.json({ data: { status: 'accepted' } });
  }

  const approval = envelope.type === 'approval.requested' ? toApprovalRequested(envelope.object) : null;
  const executed = envelope.type === 'action.executed' ? toActionExecuted(envelope.object) : null;
  if (envelope.type === 'action.undone') {
    // No push: the owner just undid it (or Nerova did). Only the id and kind are logged.
    logger.info('nerova_action_undone', { action_id: str(envelope.object.actionId), kind: str(envelope.object.kind) });
  }
  if (envelope.type === 'channel.health_changed') {
    const health = parseWhatsAppHealth(envelope.object.whatsApp);
    logger.info('nerova_channel_health_changed', {
      phone_number_status: health.phone_number_status ?? null,
      quality_rating: health.quality_rating ?? null,
      messaging_limit_tier: health.messaging_limit_tier ?? null,
      name_status: health.name_status ?? null,
      has_last_error: Boolean(health.last_error),
    });
    await repo.finishWebhookEvent(row.id, { processedAt: new Date().toISOString(), error: null, attempts: row.attempts + 1 });
    return c.json({ data: { status: 'accepted' } });
  }
  if (!approval && !executed) {
    await repo.finishWebhookEvent(row.id, { processedAt: new Date().toISOString(), error: null, attempts: row.attempts + 1 });
    return c.json({ data: { status: 'ignored' } });
  }

  runInBackground(
    async () => {
      try {
        const outcome = approval
          ? await notifyApprovalRequested(approvalPushDeps(container), approval)
          : await notifyActionExecuted(actionPushDeps(container), executed as ActionExecutedObject);
        logger.info(approval ? 'nerova_approval_webhook' : 'nerova_action_webhook', { outcome });
        await repo.finishWebhookEvent(row.id, { processedAt: new Date().toISOString(), error: null, attempts: row.attempts + 1 });
      } catch (error) {
        await repo.finishWebhookEvent(row.id, { processedAt: null, error: 'PUSH_FAILED', attempts: row.attempts + 1 }).catch(() => undefined);
        throw error;
      }
    },
    logger,
    'nerova_approval_push_failed',
  );
  return c.json({ data: { status: 'accepted' } });
});
