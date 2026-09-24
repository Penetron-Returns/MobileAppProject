/**
 * The single path for sending anything to a customer: store the message row,
 * call the Graph API, then stamp the wamid / failure. Used by the engine
 * executor, notifications, reminders and the staff inbox.
 */
import type { EscalationReason } from '../../../../packages/shared/api.ts';
import type { AppointmentChangeKind } from '../ports.ts';
import { accountGraph, type OutboundDeps } from './deps.ts';
import { signFlowToken } from './flows/token.ts';
import { GraphError, isGraphError } from './graph.ts';
import { storedBody, storedType, toGraphPayload, type OutMessage } from './messages.ts';
import type { WaAccountRow } from './repo.ts';

export interface OutboundTarget {
  account: WaAccountRow;
  businessId: string;
  conversationId: string;
  clientId: string;
  /** E.164 phone */
  to: string;
}

export interface SendOptions {
  /** Skip the send when a message with this key already exists in the conversation */
  dedupeKey?: string;
  /** Booking-critical: a failure opens a `delivery_failed` escalation */
  critical?: boolean;
  sentBy?: string | null;
  /** Record a `confirmation_sent` appointment event once the send succeeds */
  confirmation?: { appointmentId: string; kind: AppointmentChangeKind };
}

export type SendOutcome =
  | { status: 'sent'; wamid: string; messageId: string }
  | { status: 'skipped' }
  | { status: 'failed'; error: GraphError; messageId: string | null };

export async function sendOutbound(deps: OutboundDeps, target: OutboundTarget, message: OutMessage, opts: SendOptions = {}): Promise<SendOutcome> {
  const { repo, logger } = deps;
  if (opts.dedupeKey && (await repo.hasMessageWithDedupeKey(target.conversationId, opts.dedupeKey))) {
    return { status: 'skipped' };
  }

  const body = {
    ...storedBody(message),
    ...(opts.dedupeKey ? { dedupe_key: opts.dedupeKey } : {}),
    ...(opts.critical ? { critical: true } : {}),
  };
  const row = await repo.insertMessage({
    business_id: target.businessId,
    conversation_id: target.conversationId,
    direction: 'out',
    wa_message_id: null,
    type: storedType(message),
    body,
    status: 'queued',
    sent_by: opts.sentBy ?? null,
  });
  const messageId = row?.id ?? null;

  try {
    const graph = accountGraph(deps, target.account);
    if (!graph) throw new GraphError({ message: 'No usable access token for this number', status: 0, kind: 'token_invalid' });
    let flowParams: { flowId: string; flowToken: string } | undefined;
    if (message.kind === 'flow') {
      const flowId = target.account.flow_ids[message.flow];
      if (!flowId || !deps.env.FLOW_TOKEN_SECRET) throw new GraphError({ message: 'Flow not configured', status: 0, kind: 'bad_params' });
      flowParams = {
        flowId,
        flowToken: signFlowToken(deps.env.FLOW_TOKEN_SECRET, { conversationId: target.conversationId, subject: message.subject, now: deps.now() }),
      };
    }
    const { wamid } = await graph.sendMessage(target.account.phone_number_id, toGraphPayload(target.to, message, flowParams));
    if (messageId) await repo.updateMessage(messageId, { wa_message_id: wamid, status: 'sent', sent_at: deps.now().toISOString() });
    if (opts.confirmation) await recordConfirmation(deps, target, message, opts.confirmation, messageId);
    return { status: 'sent', wamid, messageId: messageId ?? '' };
  } catch (err) {
    const error = isGraphError(err) ? err : new GraphError({ message: (err as Error)?.message ?? 'send failed', status: 0, kind: 'other' });
    logger.warn('wa_send_failed', { conversation_id: target.conversationId, kind: error.kind, code: error.code ?? null });
    if (messageId) {
      await repo.updateMessage(messageId, { status: 'failed', error: { kind: error.kind, code: error.code ?? null } }).catch(() => undefined);
    }
    if (error.kind === 'token_invalid') {
      await repo.updateAccount(target.account.id, { status: 'needs_reauth', last_error: error.summary() }).catch(() => undefined);
    }
    if (opts.critical) {
      await escalate(deps, {
        businessId: target.businessId,
        conversationId: target.conversationId,
        clientId: target.clientId,
        reason: 'delivery_failed',
      }).catch(() => undefined);
    }
    return { status: 'failed', error, messageId };
  }
}

async function recordConfirmation(
  deps: OutboundDeps,
  target: OutboundTarget,
  message: OutMessage,
  c: NonNullable<SendOptions['confirmation']>,
  messageId: string | null,
): Promise<void> {
  await deps.repo
    .insertAppointmentEvent({
      businessId: target.businessId,
      appointmentId: c.appointmentId,
      type: 'confirmation_sent',
      payload: { kind: c.kind, channel: message.kind === 'template' ? 'template' : 'session', message_id: messageId },
    })
    .catch((err) => deps.logger.warn('wa_confirmation_event_failed', { appointment_id: c.appointmentId, error: err }));
}

const REASON_TEXT: Record<EscalationReason, string> = {
  customer_requested: 'A customer asked to talk to someone.',
  unrecognised_input: 'A customer needs help in WhatsApp.',
  unlinked_number: 'A customer messaged while WhatsApp is not live.',
  delivery_failed: 'A WhatsApp booking message could not be delivered.',
  flow_error: 'A customer hit an error while booking.',
  cancellation_window: 'A customer wants to change a booking inside the cancellation window.',
};

/** Opens an escalation (at most one open per conversation) and pushes staff when it is new. */
export async function escalate(
  deps: Pick<OutboundDeps, 'repo' | 'push'>,
  e: { businessId: string; conversationId: string; clientId: string; reason: EscalationReason; note?: string | null },
): Promise<{ id: string; created: boolean }> {
  const res = await deps.repo.openEscalation(e);
  if (res.created) {
    await deps.push.toBusiness(e.businessId, {
      title: 'Customer needs attention',
      body: REASON_TEXT[e.reason],
      data: { type: 'escalation', conversation_id: e.conversationId, escalation_id: res.id },
    });
  }
  return res;
}
