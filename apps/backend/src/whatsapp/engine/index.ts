/**
 * Inbound message pipeline:
 *   upsert client → load conversation → store inbound (dedupe on wamid)
 *   → transition (pure, with live data) → compare-and-set save → execute
 *   → [booking result → transition → save → execute].
 */
import type { BusinessDTO } from '../../../../../packages/shared/api.ts';
import type { WaDeps } from '../deps.ts';
import { accountGraph } from '../deps.ts';
import { verifyFlowToken } from '../flows/token.ts';
import { isInstant, isUuid } from '../ids.ts';
import { escalate, type OutboundTarget } from '../outbound.ts';
import type { ConversationPatch, ConversationRow, MessageType, WaAccountRow } from '../repo.ts';
import { executeActions } from './executor.ts';
import { bookingLoader, runTransition } from './run.ts';
import { isConvState, type EngineCtx, type EngineInput, type Snapshot, type Transition } from './types.ts';

export { transition } from './transition.ts';
export type * from './types.ts';

const WINDOW_MS = 24 * 3600_000;

/** Engine input as extracted from a webhook message, before token checks. */
export type RawInput =
  | Exclude<EngineInput, { kind: 'flow_completed' } | { kind: 'booking_result' }>
  | { kind: 'nfm_reply'; responseJson: string };

export interface InboundMessage {
  wamid: string;
  /** wa_id (digits, no +) */
  from: string;
  profileName: string | null;
  timestamp: Date;
  type: MessageType;
  /** Minimal body stored in `messages.body` */
  body: Record<string, unknown>;
  /** null = stored only, not fed to the engine (reactions, system messages) */
  input: RawInput | null;
}

export type InboundOutcome = 'processed' | 'duplicate' | 'stored' | 'not_live' | 'invalid_sender';

export async function handleInboundMessage(deps: WaDeps, account: WaAccountRow, msg: InboundMessage): Promise<InboundOutcome> {
  const { repo } = deps;
  const phone = `+${msg.from.replace(/\D/g, '')}`;
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return 'invalid_sender';

  const businessId = account.business_id;
  const client = await repo.upsertClientByPhone(businessId, phone, msg.profileName);
  let conv = await repo.getOrCreateConversation(businessId, client.id);

  const stored = await repo.insertMessage({
    business_id: businessId,
    conversation_id: conv.id,
    direction: 'in',
    wa_message_id: msg.wamid,
    type: msg.type,
    body: msg.body,
    status: 'received',
  });
  if (!stored) return 'duplicate';

  const window = windowPatch(conv, msg.timestamp, deps.now());
  const target: OutboundTarget = { account, businessId, conversationId: conv.id, clientId: client.id, to: phone };

  if (account.status !== 'live') {
    // Bot is off for this number: keep the thread current and flag it for staff.
    await casSave(deps, conv, () => window);
    await escalate(deps, { businessId, conversationId: conv.id, clientId: client.id, reason: 'unlinked_number', note: `channel_${account.status}` });
    return 'not_live';
  }

  const graph = accountGraph(deps, account);
  if (graph) await graph.markAsRead(account.phone_number_id, msg.wamid).catch(() => undefined);
  if (!msg.input) {
    await casSave(deps, conv, () => window);
    return 'stored';
  }

  const business = await deps.booking.getBusiness(businessId);
  const input = normaliseInput(deps, msg.input, conv.id);
  const makeCtx = (): EngineCtx => ({
    now: deps.now(),
    business: engineBusiness(business),
    conversationId: conv.id,
    clientId: client.id,
    clientBlocked: client.is_blocked,
    flows: {
      booking: !!account.flow_ids.booking && !!deps.env.FLOW_TOKEN_SECRET,
      reschedule: !!account.flow_ids.reschedule && !!deps.env.FLOW_TOKEN_SECRET,
    },
    inboundKey: `wa:${msg.wamid}`,
    newAttemptId: deps.newId(),
    data: {},
  });

  let result = await transitionAndSave(deps, conv, input, makeCtx, window);
  conv = result.conv;
  const bookingResult = await executeActions(deps, target, result.t.actions);
  if (bookingResult) {
    result = await transitionAndSave(deps, conv, bookingResult, makeCtx, { last_message_at: deps.now().toISOString() });
    await executeActions(deps, target, result.t.actions);
  }
  return 'processed';
}

export function engineBusiness(b: BusinessDTO): EngineCtx['business'] {
  return { id: b.id, name: b.name, timezone: b.timezone, currency: b.currency, rules: b.booking_rules };
}

export function snapshotOf(conv: ConversationRow): Snapshot {
  return {
    state: isConvState(conv.state) ? conv.state : 'idle',
    context: conv.context ?? {},
    invalidInputCount: conv.invalid_input_count ?? 0,
  };
}

function windowPatch(conv: ConversationRow, at: Date, now: Date) {
  const prev = conv.last_inbound_at ? Date.parse(conv.last_inbound_at) : 0;
  const inbound = Math.max(prev, Math.min(at.getTime(), now.getTime()));
  return {
    last_inbound_at: new Date(inbound).toISOString(),
    window_expires_at: new Date(inbound + WINDOW_MS).toISOString(),
    last_message_at: now.toISOString(),
  };
}

function normaliseInput(deps: WaDeps, raw: RawInput, conversationId: string): EngineInput {
  if (raw.kind !== 'nfm_reply') return raw;
  let response: Record<string, unknown> = {};
  try {
    response = JSON.parse(raw.responseJson) as Record<string, unknown>;
  } catch {
    return { kind: 'unsupported' };
  }
  const secret = deps.env.FLOW_TOKEN_SECRET;
  const check = secret ? verifyFlowToken(secret, response.flow_token, deps.now(), { allowExpired: true }) : null;
  const claims = check?.ok ? check.claims : null;
  const valid = !!claims && claims.conversationId === conversationId;
  const appointmentId = typeof response.appointment_id === 'string' ? response.appointment_id : null;
  return {
    kind: 'flow_completed',
    valid,
    flow: claims?.kind ?? 'booking',
    attemptId: claims?.attemptId ?? null,
    appointmentId,
    booking: bookingPayload(response),
    flowToken: valid && typeof response.flow_token === 'string' ? response.flow_token : null,
  };
}

/** The booking Flow's `complete` payload (`service_slug` carries the service id). Anything malformed is dropped. */
function bookingPayload(response: Record<string, unknown>): { serviceId: string; startsAt: string } | null {
  const { service_slug: serviceId, start_time_iso: startsAt } = response;
  if (typeof serviceId !== 'string' || !isUuid(serviceId) || typeof startsAt !== 'string' || !isInstant(startsAt)) return null;
  return { serviceId: serviceId.toLowerCase(), startsAt: new Date(startsAt).toISOString() };
}

const CAS_ATTEMPTS = 3;

/** Compare-and-set on `version`: on conflict reload and re-run the transition. */
async function transitionAndSave(
  deps: WaDeps,
  conv: ConversationRow,
  input: EngineInput,
  makeCtx: () => EngineCtx,
  extra: ConversationPatch,
): Promise<{ conv: ConversationRow; t: Transition }> {
  let current = conv;
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const ctx = makeCtx();
    const t = await runTransition(snapshotOf(current), input, ctx, bookingLoader(deps.booking, ctx));
    const saved = await deps.repo.saveConversation(current.id, current.version, {
      state: t.state,
      context: t.context,
      invalid_input_count: t.invalidInputCount,
      ...extra,
    });
    if (saved) return { conv: saved, t };
    const reloaded = await deps.repo.getConversation(current.id);
    if (!reloaded) break;
    current = reloaded;
  }
  throw new Error('conversation_conflict');
}

/** Saves a patch with the same compare-and-set rule (no transition). */
export async function casSave(deps: Pick<WaDeps, 'repo'>, conv: ConversationRow, patch: (c: ConversationRow) => ConversationPatch): Promise<ConversationRow | null> {
  let current: ConversationRow | null = conv;
  for (let attempt = 0; attempt < CAS_ATTEMPTS && current; attempt++) {
    const saved = await deps.repo.saveConversation(current.id, current.version, patch(current));
    if (saved) return saved;
    current = await deps.repo.getConversation(current.id);
  }
  return null;
}
