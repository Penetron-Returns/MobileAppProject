/**
 * Owner-to-human support handover. Nerova's `request_human_support` owner tool raises `escalation.raised` with
 * `source: "owner_support"`; we persist it as an open support request and log a structured event (the support
 * team reads `support_requests`, the log and an email alert to the support inbox). Nerova's
 * `escalation.resolved` closes the account's open requests. Any other escalation source is not ours to handle.
 * The summary holds the owner's words: it is stored, never logged. The log carries ids and enum values only.
 */
import { z } from 'zod';

import type { AttendancePush } from '@booking/features/attendance/ports.ts';
import type { Logger } from '@booking/features/lib/logger.ts';
import type { WhatsAppHealthDTO } from '@booking/types';
import type { SupportAlert, SupportAlertSender, SupportRequestsRepository } from '@booking/features/support/ports.ts';
import { parseWhatsAppHealth } from '../nerova/whatsappHealth.ts';

export const OWNER_SUPPORT_SOURCE = 'owner_support';
export const SUPPORT_PUSH_TITLE = 'We got your message';
export const SUPPORT_PUSH_BODY = 'Support will reply on WhatsApp.';

const base = {
  accountId: z.string().min(1).max(200),
  /** Our business id (Nerova's external reference); optional because the account id alone is enough */
  externalReference: z.string().nullish(),
  source: z.literal(OWNER_SUPPORT_SOURCE),
};

export const supportRaisedSchema = z.object({
  ...base,
  summary: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 4000)),
  whatsAppHealth: z.unknown().optional(),
  // Nerova's final payload also carries these; all optional and only used for the alert email. Extras are tolerated.
  category: z.string().nullish(),
  reason: z.string().nullish(),
  status: z.string().nullish(),
  raisedAt: z.string().nullish(),
  escalation: z.object({ id: z.string().nullish() }).nullish(),
});
export const supportResolvedSchema = z.object(base);

export type SupportOutcome = 'opened' | 'resolved' | 'no_business';

export interface SupportDeps {
  repo: SupportRequestsRepository;
  /** Null until a push sender is wired (the owner confirmation is optional) */
  push: AttendancePush | null;
  logger: Logger;
  clock: () => Date;
  /** Support inbox email; absent = no alert (the log line remains) */
  alerts?: SupportAlertSender | null;
}

/** True for an `escalation.*` object whose `source` is the owner-support one. */
export const isOwnerSupport = (object: Record<string, unknown>): boolean => object.source === OWNER_SUPPORT_SOURCE;

export async function openSupportRequest(
  deps: SupportDeps,
  event: z.infer<typeof supportRaisedSchema>,
): Promise<{ outcome: SupportOutcome; businessId: string | null; alert: SupportAlert | null }> {
  const businessId = await deps.repo.findBusinessId({ accountId: event.accountId, externalReference: event.externalReference ?? null });
  if (!businessId) {
    deps.logger.warn('support_request_no_business', { account_id: event.accountId });
    return { outcome: 'no_business', businessId: null, alert: null };
  }
  const health = parseWhatsAppHealth(event.whatsAppHealth);
  const row = await deps.repo.open({ businessId, nerovaAccountId: event.accountId, summary: event.summary, health });
  // Structured, PII-free: this is the line the support team's log alert matches on.
  deps.logger.info('support_request_opened', {
    business_id: businessId,
    support_request_id: row.id,
    account_id: event.accountId,
    phone_number_status: health.phone_number_status ?? null,
    quality_rating: health.quality_rating ?? null,
    messaging_limit_tier: health.messaging_limit_tier ?? null,
    payment_method_attached: health.billing?.payment_method_attached ?? null,
    send_failure_kinds: health.recent_send_failures?.length ?? 0,
  });
  const alert: SupportAlert = {
    businessId,
    businessName: null,
    supportRequestId: row.id,
    category: event.category ?? null,
    reason: event.reason ?? null,
    summary: event.summary,
    healthSummary: summariseHealth(health),
    raisedAt: event.raisedAt ?? null,
    escalationId: event.escalation?.id ?? null,
  };
  return { outcome: 'opened', businessId, alert };
}

/** One line: status, quality, verification (name status) and billing (unknown / attached / missing). */
export function summariseHealth(health: WhatsAppHealthDTO): string {
  const payment = health.billing?.payment_method_attached;
  const billing = payment === true ? 'attached' : payment === false ? 'missing' : 'unknown';
  return [
    `status ${health.phone_number_status ?? 'unknown'}`,
    `quality ${health.quality_rating ?? 'unknown'}`,
    `verification ${health.name_status ?? 'unknown'}`,
    `billing payment method ${billing}`,
  ].join(', ');
}

/** Best effort email to the support inbox. Never throws: a failed send is logged and the webhook still succeeds. */
export async function sendSupportAlert(deps: SupportDeps, alert: SupportAlert): Promise<void> {
  if (!deps.alerts) return;
  try {
    const businessName = await deps.repo.getBusinessName(alert.businessId).catch(() => null);
    await deps.alerts.send({ ...alert, businessName });
  } catch (error) {
    deps.logger.warn('support_alert_failed', { business_id: alert.businessId, support_request_id: alert.supportRequestId, error });
  }
}

export async function resolveSupportRequests(deps: SupportDeps, event: z.infer<typeof supportResolvedSchema>): Promise<{ outcome: SupportOutcome }> {
  const businessId = await deps.repo.findBusinessId({ accountId: event.accountId, externalReference: event.externalReference ?? null });
  if (!businessId) return { outcome: 'no_business' };
  const resolved = await deps.repo.resolveOpen({ businessId, nerovaAccountId: event.accountId, nowIso: deps.clock().toISOString() });
  deps.logger.info('support_request_resolved', { business_id: businessId, account_id: event.accountId, resolved });
  return { outcome: 'resolved' };
}

/** Best effort "we got your message" push to the owners. Never throws. */
export async function notifyOwnerSupportReceived(deps: SupportDeps, businessId: string): Promise<void> {
  if (!deps.push) return;
  try {
    const owners = await deps.repo.listOwnerIds(businessId);
    if (owners.length === 0) return;
    await deps.push.toUsers(businessId, owners, { title: SUPPORT_PUSH_TITLE, body: SUPPORT_PUSH_BODY, data: { type: 'support', businessId } });
  } catch (error) {
    deps.logger.warn('support_push_failed', { business_id: businessId, error });
  }
}
