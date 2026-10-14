/**
 * Processes authenticated webhook payloads. Each event is first recorded in
 * `webhook_events` (unique on source+event_key, so Meta's at-least-once
 * redeliveries are skipped), then handled, then stamped with processed_at
 * and an outcome note in `error` (null = clean).
 *
 * If recording itself fails we rethrow so the route answers 500 and Meta
 * retries. Failures after recording are kept on the row and never bubble up.
 */
import type { TemplateStatus } from '@booking/types';
import { hasFeatureOrNone } from '../../plans/entitlements.ts';
import type { WaDeps } from '../deps.ts';
import { handleInboundMessage } from '../engine/index.ts';
import { escalate } from '../outbound.ts';
import type { WaAccountRow } from '../repo.ts';
import { extractEvents, type WaEvent, type WebhookPayload } from './events.ts';

export interface WebhookSummary {
  events: number;
  duplicates: number;
  errors: number;
}

export async function processWebhook(deps: WaDeps, payload: WebhookPayload): Promise<WebhookSummary> {
  const summary: WebhookSummary = { events: 0, duplicates: 0, errors: 0 };
  for (const event of extractEvents(payload)) {
    summary.events += 1;
    const accounts = await accountsFor(deps, event);
    const record = await deps.repo.recordWebhookEvent({ eventKey: event.key, accountId: accounts[0]?.id ?? null, payload: event.raw });
    if (!record) {
      summary.duplicates += 1;
      continue;
    }
    let note: string | null;
    try {
      note = await handleEvent(deps, event, accounts);
    } catch (err) {
      summary.errors += 1;
      note = `exception: ${(err as Error)?.message ?? 'unknown'}`.slice(0, 300);
      deps.logger.error('wa_webhook_event_failed', { event_type: event.type, error: err });
    }
    await deps.repo.finishWebhookEvent(record.id, note, deps.now().toISOString()).catch((err) => deps.logger.error('wa_webhook_finish_failed', { error: err }));
  }
  return summary;
}

async function accountsFor(deps: WaDeps, event: WaEvent): Promise<WaAccountRow[]> {
  if (event.type === 'message' || event.type === 'status') {
    const account = await deps.repo.getAccountByPhoneNumberId(event.phoneNumberId);
    return account ? [account] : [];
  }
  return deps.repo.getAccountsByWabaId(event.wabaId);
}

async function handleEvent(deps: WaDeps, event: WaEvent, accounts: WaAccountRow[]): Promise<string | null> {
  switch (event.type) {
    case 'message': {
      const account = accounts[0];
      if (!account) return 'unlinked_number';
      // Paid plans: Nerova owns WhatsApp, so our deterministic engine must stay silent.
      if (!(await hasFeatureOrNone(deps.entitlements, account.business_id, 'whatsapp_menu'))) {
        deps.logger.info('wa_inbound_skipped_feature_not_in_plan', { business_id: account.business_id });
        return 'feature_not_in_plan';
      }
      const outcome = await handleInboundMessage(deps, account, event.message);
      if (outcome === 'not_live') return `account_${account.status}`;
      if (outcome === 'duplicate' || outcome === 'invalid_sender') return outcome;
      return null;
    }
    case 'status':
      return handleStatus(deps, event);
    case 'template_status':
      return handleTemplate(deps, event, accounts);
    case 'quality': {
      if (!accounts.length) return 'unlinked_number';
      const quality = event.event === 'FLAGGED' ? 'RED' : event.event === 'UNFLAGGED' ? 'GREEN' : undefined;
      for (const a of accounts) {
        if (event.displayPhone && a.display_phone && digits(a.display_phone) !== digits(event.displayPhone)) continue;
        await deps.repo.updateAccount(a.id, {
          ...(event.currentLimit ? { messaging_limit: event.currentLimit } : {}),
          ...(quality ? { quality_rating: quality } : {}),
        });
      }
      return null;
    }
    case 'account_update': {
      if (!accounts.length) return 'unlinked_number';
      const gone = event.event === 'PARTNER_REMOVED' || event.event === 'ACCOUNT_DELETED';
      const benign = event.event === 'VERIFIED_ACCOUNT' || event.event === 'PARTNER_ADDED';
      if (!benign) {
        for (const a of accounts) {
          await deps.repo.updateAccount(a.id, { last_error: `account_update:${event.event}`, ...(gone ? { status: 'disconnected' } : {}) });
        }
      }
      return null;
    }
    case 'ignored':
      return `ignored_field:${event.field}`;
  }
}

async function handleStatus(deps: WaDeps, event: Extract<WaEvent, { type: 'status' }>): Promise<string | null> {
  const error = event.errors.length ? { code: event.errors[0]!.code ?? null, title: event.errors[0]!.title ?? null } : null;
  const row = await deps.repo.updateMessageStatusByWamid(event.wamid, { status: event.status, at: event.at, error });
  if (!row) return 'message_not_found';
  if (event.status === 'failed' && row.direction === 'out' && row.body?.critical === true) {
    const conv = await deps.repo.getConversation(row.conversation_id);
    if (conv) {
      await escalate(deps, { businessId: row.business_id, conversationId: conv.id, clientId: conv.client_id, reason: 'delivery_failed' });
    }
  }
  return null;
}

const TEMPLATE_EVENTS: Record<string, TemplateStatus> = {
  APPROVED: 'approved',
  REINSTATED: 'approved',
  REJECTED: 'rejected',
  PENDING: 'submitted',
  PAUSED: 'paused',
  DISABLED: 'disabled',
};

async function handleTemplate(deps: WaDeps, event: Extract<WaEvent, { type: 'template_status' }>, accounts: WaAccountRow[]): Promise<string | null> {
  if (!accounts.length) return 'unlinked_number';
  const status = TEMPLATE_EVENTS[event.event];
  if (!status) return `ignored_template_event:${event.event}`;
  let updated = 0;
  for (const a of accounts) {
    const reason = status === 'rejected' && event.reason && event.reason !== 'NONE' ? event.reason : null;
    const patch = { status, rejection_reason: reason, meta_template_id: event.templateId };
    let n = await deps.repo.updateTemplateStatus(a.id, { metaTemplateId: event.templateId }, patch);
    if (n === 0) n = await deps.repo.updateTemplateStatus(a.id, { name: event.name, language: event.language }, patch);
    updated += n;
  }
  return updated ? null : 'template_not_found';
}

const digits = (v: string) => v.replace(/\D/g, '');
