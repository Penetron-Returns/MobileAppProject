/** fetch implementation of CompanionChatClient. Per-call timeout, every failure mapped to an AppError. */
import { AppError } from '@booking/features/lib/errors.ts';
import type { ApprovalDecision, ApprovalOutcome, CompanionChatClient, CompanionChatSession } from './chatClient.ts';
import { parseAction, parseChatStream, type ChatAction, type ChatTurn } from './chatStream.ts';
import { NEROVA_API_BASE_URL } from './httpClient.ts';

/** The whole turn runs before the first byte, so this is longer than a JSON call. */
export const CHAT_TIMEOUT_MS = 28_000;
const DECIDE_TIMEOUT_MS = 12_000;

export interface HttpChatClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** Maps a Nerova problem code (or an in-stream error code) to our AppError. */
export function companionProblemError(status: number, code: string | null, retryAfter: string | null = null): AppError {
  const details = { status, nerova_code: code };
  switch (code) {
    case 'companion.account_not_ready':
      return new AppError('COMPANION_NOT_READY', 'The companion is not ready yet', { reason: 'not_provisioned' });
    case 'approval.not_found':
      return new AppError('NOT_FOUND', 'Approval not found', details);
    case 'approval.expired':
      return new AppError('WINDOW_CLOSED', 'The approval has expired', { ...details, reason: 'approval_expired' });
    case 'approval.already_decided':
    case 'approval.connector_conflict':
      return new AppError('RULE_VIOLATION', 'The change could not be made', { ...details, rule: code });
    case 'action.not_found':
      return new AppError('NOT_FOUND', 'Action not found', details);
    case 'action.undo_window_closed':
    case 'action.not_undoable':
    case 'action.undo_failed':
      return new AppError('RULE_VIOLATION', 'That action can no longer be undone', { ...details, rule: code, reason: code });
    case 'action.connector_unavailable':
      return new AppError('UPSTREAM_COMPANION_ERROR', 'The booking system is unavailable, try again shortly', { ...details, retryable: true });
    default:
      break;
  }
  if (status === 429 || code === 'request.rate_limited') {
    const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);
    const extra = Number.isFinite(seconds) && seconds >= 0 ? { retry_after_s: seconds } : {};
    return new AppError('RATE_LIMITED', 'The companion is busy, try again shortly', { ...details, ...extra });
  }
  if (status === 400) return new AppError('VALIDATION_FAILED', 'The companion rejected the message', details);
  return new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service could not answer', details);
}

export function createHttpCompanionChatClient(options: HttpChatClientOptions = {}): CompanionChatClient {
  const doFetch = options.fetch ?? fetch;
  const base = (options.baseUrl ?? NEROVA_API_BASE_URL).replace(/\/+$/, '');

  async function send(path: string, session: CompanionChatSession, body: unknown, timeoutMs: number, extra: Record<string, string> = {}, method: 'GET' | 'POST' = 'POST'): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          'X-Widget-Session-Id': session.sessionId,
          'X-Widget-State': session.state,
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          Accept: 'text/event-stream, application/json',
          ...extra,
        },
        body: method === 'POST' ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AppError('UPSTREAM_COMPANION_ERROR', timedOut ? 'The companion timed out' : 'The companion is unreachable', { reason: timedOut ? 'timeout' : 'network' });
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as Json | null;
      throw companionProblemError(response.status, str(payload?.code), response.headers.get('retry-after'));
    }
    return response;
  }

  async function chat(session: CompanionChatSession, message: string): Promise<ChatTurn> {
    const response = await send('/v1/companion/chat', session, { message }, options.timeoutMs ?? CHAT_TIMEOUT_MS);
    const turn = parseChatStream(await response.text());
    if (turn.error) {
      const mapped = companionProblemError(502, turn.error.code);
      throw new AppError(mapped.code, mapped.message, { ...mapped.details, nerova_code: turn.error.code, retryable: turn.error.retryable });
    }
    return turn;
  }

  async function decide(session: CompanionChatSession, approvalId: string, decision: ApprovalDecision, idempotencyKey: string): Promise<ApprovalOutcome> {
    const path = `/v1/companion/approvals/${encodeURIComponent(approvalId)}/${decision}`;
    const response = await send(path, session, {}, options.timeoutMs ?? DECIDE_TIMEOUT_MS, { 'Idempotency-Key': idempotencyKey });
    const payload = (await response.json().catch(() => null)) as Json | null;
    const inner = typeof payload?.approval === 'object' && payload.approval !== null ? (payload.approval as Json) : payload;
    return { kind: str(inner?.kind) };
  }

  /** An action is the body itself or wrapped as `{ action }` / `{ data }`; a body without a usable action is an upstream error. */
  const actionOf = (payload: Json | null): ChatAction => {
    const inner = [payload?.action, payload?.data].find((v) => typeof v === 'object' && v !== null);
    const action = parseAction((inner ?? payload ?? {}) as Json);
    if (!action) throw new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service returned an unexpected action', { reason: 'unexpected_response' });
    return action;
  };

  async function undoAction(session: CompanionChatSession, actionId: string, idempotencyKey: string): Promise<ChatAction> {
    const path = `/v1/companion/actions/${encodeURIComponent(actionId)}/undo`;
    const response = await send(path, session, {}, options.timeoutMs ?? DECIDE_TIMEOUT_MS, { 'Idempotency-Key': idempotencyKey });
    return actionOf((await response.json().catch(() => null)) as Json | null);
  }

  async function listActions(session: CompanionChatSession, status: 'executed' | 'undone'): Promise<ChatAction[]> {
    const response = await send(`/v1/companion/actions?status=${status}`, session, undefined, options.timeoutMs ?? DECIDE_TIMEOUT_MS, {}, 'GET');
    const payload = (await response.json().catch(() => null)) as Json | null;
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
    return items.map((i) => (typeof i === 'object' && i !== null ? parseAction(i as Json) : null)).filter((a): a is ChatAction => a !== null);
  }

  return { chat, decide, undoAction, listActions };
}
