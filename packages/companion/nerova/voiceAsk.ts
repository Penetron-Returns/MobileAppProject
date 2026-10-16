/**
 * Voice ask: sends a spoken request to the owner's Nerova companion and returns its whole reply, and decides the
 * approvals it raises. Depends on the CompanionService (native session minting) and the CompanionChatClient port only.
 * A session is cached per business and user for its lifetime minus a margin, so a voice command does not mint one each
 * time. Never logs the text, the reply, titles or names.
 */
import type { UUID, VoiceApprovalResultDTO, VoiceAskDTO } from '@booking/types';
import { sha256Hex } from '@booking/features/lib/crypto.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { ApprovalDecision, CompanionChatClient, CompanionChatSession } from './chatClient.ts';
import type { CompanionService } from './companionService.ts';

/** A session is replaced this long before Nerova would expire it. */
export const SESSION_MARGIN_MS = 60_000;
const MAX_KEY_LENGTH = 128;
const SESSION_ERRORS = new Set(['companion.session_expired', 'companion.session_invalid']);

export interface VoiceCaller {
  businessId: UUID;
  /** Clerk user id */
  userId: string;
}

export interface VoiceAskService {
  ask(caller: VoiceCaller, text: string): Promise<VoiceAskDTO>;
  /** Decides exactly `approvalId`: never "the latest pending". */
  decide(caller: VoiceCaller, approvalId: string, decision: ApprovalDecision, idempotencyKey: string): Promise<VoiceApprovalResultDTO>;
}

export interface VoiceAskDeps {
  companion: CompanionService;
  chat: CompanionChatClient;
  clock: () => Date;
}

const isSessionError = (error: unknown): boolean =>
  error instanceof AppError && error.code === 'UPSTREAM_COMPANION_ERROR' && typeof error.details?.nerova_code === 'string' && SESSION_ERRORS.has(error.details.nerova_code);

/** Nerova accepts idempotency keys of 8 to 128 characters. */
const nerovaKey = (key: string): string => (key.length <= MAX_KEY_LENGTH ? key : `voice-${sha256Hex(key)}`);

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
        approvals: turn.approvals.map(({ id, kind, title, lines }) => ({ id, kind, title, lines })),
        suggestions: turn.suggestions,
      };
    },

    async decide(caller, approvalId, decision, idempotencyKey) {
      const outcome = await withSession(caller, (s) => chat.decide(s, approvalId, decision, nerovaKey(idempotencyKey)));
      return { id: approvalId, decision: decision === 'approve' ? 'approved' : 'declined', kind: outcome.kind };
    },
  };
}
