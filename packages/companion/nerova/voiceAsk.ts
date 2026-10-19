/**
 * Voice ask: sends a spoken request to the owner's Nerova companion and returns its whole reply, and decides the
 * approvals it raises. Depends on the CompanionService (native session minting) and the CompanionChatClient port only.
 * A session is cached per business and user for its lifetime minus a margin, so a voice command does not mint one each
 * time. Never logs the text, the reply, titles or names.
 */
import type { UUID, VoiceActionDTO, VoiceApprovalResultDTO, VoiceAskDTO } from '@booking/types';
import { sha256Hex } from '@booking/features/lib/crypto.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { ChatAction, ChatApproval, ChatStreamEvent, NerovaTurnTiming } from './chatStream.ts';
import type { ApprovalDecision, CompanionChatClient, CompanionChatSession } from './chatClient.ts';
import type { CompanionService } from './companionService.ts';
import { companionProblemError } from './httpChatClient.ts';

/** A session is replaced this long before Nerova would expire it. */
export const SESSION_MARGIN_MS = 60_000;
const MAX_KEY_LENGTH = 128;
const SESSION_ERRORS = new Set(['companion.session_expired', 'companion.session_invalid']);

export interface VoiceCaller {
  businessId: UUID;
  /** Clerk user id */
  userId: string;
}

/** What a streamed voice turn yields: the reply text as it is generated, then everything else in one `done`. */
export type VoiceStreamItem =
  | { type: 'text-delta'; delta: string }
  | { type: 'done'; data: VoiceAskDTO; timing?: NerovaTurnTiming }
  | { type: 'error'; code: string; retryable: boolean };

export interface VoiceAskStream {
  events: AsyncIterable<VoiceStreamItem>;
  /** Nerova's own `Server-Timing: pre` (ms), when sent */
  nerovaPreMs: number | null;
}

export interface VoiceAskService {
  ask(caller: VoiceCaller, text: string): Promise<VoiceAskDTO>;
  /**
   * Streams one turn (`mode: "voice"` when enabled). Throws before any event for the errors `ask` throws; a failure after
   * the first byte arrives as an `error` item. `signal` aborting closes the Nerova connection.
   */
  askStream(caller: VoiceCaller, text: string, signal?: AbortSignal): Promise<VoiceAskStream>;
  /** Decides exactly `approvalId`: never "the latest pending". */
  decide(caller: VoiceCaller, approvalId: string, decision: ApprovalDecision, idempotencyKey: string): Promise<VoiceApprovalResultDTO>;
  /** Undoes exactly `actionId` while its window is open. Errors as CompanionChatClient.undoAction. */
  undo(caller: VoiceCaller, actionId: string, idempotencyKey: string): Promise<VoiceActionDTO>;
  /** The owner's actions with this status (the app shows what can still be undone) */
  listActions(caller: VoiceCaller, status: 'executed' | 'undone'): Promise<VoiceActionDTO[]>;
}

export interface VoiceAskDeps {
  companion: CompanionService;
  chat: CompanionChatClient;
  clock: () => Date;
}

const toActionDTO = (a: ChatAction): VoiceActionDTO => ({
  id: a.id,
  kind: a.kind,
  status: a.status,
  title: a.title,
  readBack: a.readBack,
  lines: a.lines,
  executedAt: a.executedAt,
  undoUntil: a.undoUntil,
  undoable: a.undoable,
  ...(a.undoneAt ? { undoneAt: a.undoneAt } : {}),
});

const isSessionError = (error: unknown): boolean =>
  error instanceof AppError && error.code === 'UPSTREAM_COMPANION_ERROR' && typeof error.details?.nerova_code === 'string' && SESSION_ERRORS.has(error.details.nerova_code);

/** Nerova accepts idempotency keys of 8 to 128 characters. */
const nerovaKey = (key: string): string => (key.length <= MAX_KEY_LENGTH ? key : `voice-${sha256Hex(key)}`);

const toApprovalDTO = ({ id, kind, title, lines }: ChatApproval) => ({ id, kind, title, lines });

export function createVoiceAskService(deps: VoiceAskDeps): VoiceAskService {
  const { companion, chat, clock } = deps;
  const cache = new Map<string, { session: CompanionChatSession; expiresAt: number }>();
  const minting = new Map<string, Promise<CompanionChatSession>>();
  const cacheKey = (c: VoiceCaller) => `${c.businessId}:${c.userId}`;

  async function mint(caller: VoiceCaller): Promise<CompanionChatSession> {
    const created = await companion.createSession(caller.businessId, { ownerReference: caller.userId, colorMode: 'light', platform: 'native' });
    if (!created.session_id || !created.state) {
      // NEROVA_NATIVE_SESSIONS is off: no native session exists, so the companion cannot be reached from here.
      throw new AppError('COMPANION_NOT_READY', 'The companion is not ready yet', { reason: 'unavailable' });
    }
    const session = { sessionId: created.session_id, state: created.state };
    cache.set(cacheKey(caller), { session, expiresAt: Date.parse(created.expires_at) - SESSION_MARGIN_MS });
    return session;
  }

  async function session(caller: VoiceCaller, fresh: boolean): Promise<CompanionChatSession> {
    const key = cacheKey(caller);
    if (!fresh) {
      const hit = cache.get(key);
      if (hit && hit.expiresAt > clock().getTime()) return hit.session;
    }
    const inFlight = minting.get(key);
    if (inFlight && !fresh) return inFlight;
    const promise = mint(caller).finally(() => minting.delete(key));
    minting.set(key, promise);
    return promise;
  }

  /** Runs `fn` with the cached session; on an expired session mints a new one and retries once. */
  async function withSession<T>(caller: VoiceCaller, fn: (s: CompanionChatSession) => Promise<T>): Promise<T> {
    try {
      return await fn(await session(caller, false));
    } catch (error) {
      if (!isSessionError(error)) throw error;
      cache.delete(cacheKey(caller));
      return fn(await session(caller, true));
    }
  }

  return {
    async ask(caller, text) {
      const turn = await withSession(caller, (s) => chat.chat(s, text));
      return {
        reply: turn.reply,
        approvals: turn.approvals.map(toApprovalDTO),
        actions: turn.actions.map(toActionDTO),
        suggestions: turn.suggestions,
        ...(turn.awaitingReply === undefined ? {} : { awaitingReply: turn.awaitingReply }),
      };
    },

    async askStream(caller, text, signal) {
      const handle = await withSession(caller, (s) => chat.streamChat(s, text, { mode: 'voice', ...(signal ? { signal } : {}) }));
      return { events: toVoiceItems(handle.events), nerovaPreMs: handle.preMs };
    },

    async decide(caller, approvalId, decision, idempotencyKey) {
      const outcome = await withSession(caller, (s) => chat.decide(s, approvalId, decision, nerovaKey(idempotencyKey)));
      return { id: approvalId, decision: decision === 'approve' ? 'approved' : 'declined', kind: outcome.kind };
    },

    async undo(caller, actionId, idempotencyKey) {
      return toActionDTO(await withSession(caller, (s) => chat.undoAction(s, actionId, nerovaKey(idempotencyKey))));
    },

    async listActions(caller, status) {
      return (await withSession(caller, (s) => chat.listActions(s, status))).map(toActionDTO);
    },
  };
}

/** Folds Nerova events into text deltas plus one `done` carrying the same data the whole-reply route returns. */
async function* toVoiceItems(events: AsyncIterable<ChatStreamEvent>): AsyncGenerator<VoiceStreamItem> {
  let reply = '';
  const approvals: ChatApproval[] = [];
  const actions: ChatAction[] = [];
  try {
    for await (const event of events) {
      if (event.type === 'text-delta') {
        reply += event.delta;
        yield event;
      } else if (event.type === 'approval') {
        approvals.push(event.approval);
      } else if (event.type === 'action') {
        const at = actions.findIndex((a) => a.id === event.action.id);
        if (at >= 0) actions[at] = event.action;
        else actions.push(event.action);
      } else if (event.type === 'error') {
        return yield { type: 'error', code: companionProblemError(502, event.error.code).code, retryable: event.error.retryable };
      } else {
        const data: VoiceAskDTO = {
          reply: reply.trim(),
          approvals: approvals.map(toApprovalDTO),
          actions: actions.map(toActionDTO),
          suggestions: event.suggestions,
          ...(event.awaitingReply === undefined ? {} : { awaitingReply: event.awaitingReply }),
        };
        return yield { type: 'done', data, ...(event.timing ? { timing: event.timing } : {}) };
      }
    }
  } catch (error) {
    const code = error instanceof AppError ? error.code : 'INTERNAL';
    return yield { type: 'error', code, retryable: true };
  }
  // Closed without `done`: the reply so far is all there is.
  yield reply.trim() ? { type: 'done', data: { reply: reply.trim(), approvals: approvals.map(toApprovalDTO), actions: actions.map(toActionDTO), suggestions: [] } } : { type: 'error', code: 'UPSTREAM_COMPANION_ERROR', retryable: true };
}
