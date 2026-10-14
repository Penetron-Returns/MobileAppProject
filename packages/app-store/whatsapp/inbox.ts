/**
 * Staff inbox actions. Everything is scoped by the caller's business id.
 *
 * - A staff reply takes the thread over: state → `escalated` (the bot stays
 *   silent), any active booking attempt is abandoned, and the message is
 *   stored with `sent_by`. Free text can only go out inside the 24h window.
 * - Release hands the thread back to the bot: open escalations are resolved
 *   and the main menu is sent (state `menu`) when the window is open,
 *   otherwise the thread goes to `idle` so the next message shows the menu.
 */
import { AppError } from '@booking/features/lib/errors.ts';
import { accountGraph, type WaDeps } from './deps.ts';
import { casSave } from './engine/index.ts';
import { menuMessage } from './engine/render.ts';
import { text } from './messages.ts';
import { sendOutbound, type OutboundTarget } from './outbound.ts';
import type { ConversationRow, EscalationRow, WaAccountRow } from './repo.ts';

export interface StaffMessageResult {
  message_id: string;
  wa_message_id: string;
  conversation_state: 'escalated';
}

export interface ReleaseResult {
  conversation_id: string;
  state: 'menu' | 'idle';
  escalations_resolved: number;
}

export type EscalationResult = Pick<EscalationRow, 'id' | 'conversation_id' | 'reason' | 'status' | 'note' | 'resolved_at' | 'resolved_by'>;

const windowOpen = (conv: ConversationRow, now: Date) => !!conv.window_expires_at && Date.parse(conv.window_expires_at) > now.getTime();

/** Staff may reply while the bot is live or paused. */
const canSend = (deps: WaDeps, account: WaAccountRow | null): account is WaAccountRow =>
  !!account && (account.status === 'live' || account.status === 'paused') && !!accountGraph(deps, account);

async function loadThread(deps: WaDeps, businessId: string, conversationId: string) {
  const conv = await deps.repo.getConversation(conversationId, businessId);
  if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found');
  const client = await deps.repo.getClient(businessId, conv.client_id);
  if (!client) throw new AppError('NOT_FOUND', 'Conversation not found');
  const account = await deps.repo.getAccountByBusiness(businessId);
  return { conv, client, account };
}

export async function sendStaffMessage(
  deps: WaDeps,
  input: { businessId: string; conversationId: string; userId: string; text: string },
): Promise<StaffMessageResult> {
  const { conv, client, account } = await loadThread(deps, input.businessId, input.conversationId);
  const now = deps.now();
  if (!windowOpen(conv, now)) {
    throw new AppError('WINDOW_CLOSED', 'The 24-hour WhatsApp window has closed. The customer has to message you first.');
  }
  if (!canSend(deps, account)) {
    throw new AppError('RULE_VIOLATION', 'WhatsApp is not connected', { rule: 'CHANNEL_NOT_CONNECTED' });
  }

  // Take the thread over before sending, so a customer reply in between is not answered by the bot.
  const attemptId = conv.context.attemptId;
  const saved = await casSave(deps, conv, () => ({
    state: 'escalated',
    context: { ackSent: true },
    invalid_input_count: 0,
    last_message_at: now.toISOString(),
  }));
  if (!saved) throw new AppError('INTERNAL', 'Conversation is busy, please try again');
  if (attemptId) await deps.repo.finishAttempt(attemptId, 'abandoned', { at: now.toISOString() }).catch(() => undefined);

  const target: OutboundTarget = { account, businessId: input.businessId, conversationId: conv.id, clientId: client.id, to: client.phone_e164 };
  const outcome = await sendOutbound(deps, target, text(input.text), { sentBy: input.userId });
  if (outcome.status === 'failed') {
    if (outcome.error.kind === 'outside_window') throw new AppError('WINDOW_CLOSED', 'The 24-hour WhatsApp window has closed');
    throw new AppError('UPSTREAM_META_ERROR', 'WhatsApp did not accept the message', {
      kind: outcome.error.kind,
      meta_code: outcome.error.code ?? null,
      message_id: outcome.messageId,
    });
  }
  if (outcome.status === 'skipped') throw new AppError('INTERNAL', 'Message was not sent');
  return { message_id: outcome.messageId, wa_message_id: outcome.wamid, conversation_state: 'escalated' };
}

export async function releaseConversation(
  deps: WaDeps,
  input: { businessId: string; conversationId: string; userId: string },
): Promise<ReleaseResult> {
  const { conv, client, account } = await loadThread(deps, input.businessId, input.conversationId);
  const now = deps.now();
  const at = now.toISOString();
  const resolved = await deps.repo.resolveOpenEscalations(input.businessId, conv.id, input.userId, at);
  await deps.repo.abandonAttemptsForConversation(conv.id, at);

  let state: ReleaseResult['state'] = 'idle';
  if (windowOpen(conv, now) && canSend(deps, account) && account.status === 'live') {
    const business = await deps.repo.getBusinessBrief(input.businessId);
    const target: OutboundTarget = { account, businessId: input.businessId, conversationId: conv.id, clientId: client.id, to: client.phone_e164 };
    const outcome = await sendOutbound(deps, target, menuMessage(business?.name ?? 'us'));
    if (outcome.status === 'sent') state = 'menu';
  }
  const saved = await casSave(deps, conv, () => ({ state, context: {}, invalid_input_count: 0 }));
  if (!saved) throw new AppError('INTERNAL', 'Conversation is busy, please try again');
  return { conversation_id: conv.id, state, escalations_resolved: resolved };
}

export async function resolveEscalation(
  deps: WaDeps,
  input: { businessId: string; escalationId: string; userId: string; note: string | null },
): Promise<EscalationResult> {
  const row = await deps.repo.resolveEscalation(input.businessId, input.escalationId, input.userId, input.note, deps.now().toISOString());
  if (!row) throw new AppError('NOT_FOUND', 'Escalation not found');
  const { id, conversation_id, reason, status, note, resolved_at, resolved_by } = row;
  return { id, conversation_id, reason, status, note, resolved_at, resolved_by };
}
