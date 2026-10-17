/**
 * Parser for the Nerova companion chat stream (`POST /v1/companion/chat`, server-sent events). The turn runs
 * before the first byte, so the whole body is parsed at once. Pure: text in, turn out. Never logs anything.
 */

export interface ChatApprovalLine {
  label: string;
  from: string | null;
  to: string;
}

export interface ChatApproval {
  id: string;
  kind: string;
  title: string;
  lines: ChatApprovalLine[];
  expiresAt: string | null;
}

/** An action the companion executed under act-then-undo (SSE `action`); `undone` re-emits the same id. */
export interface ChatAction {
  id: string;
  kind: string;
  status: 'executed' | 'undone';
  title: string;
  readBack: string;
  lines: ChatApprovalLine[];
  executedAt: string | null;
  undoUntil: string | null;
  undoable: boolean;
  undoneAt?: string;
}

export interface ChatStreamError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ChatTurn {
  /** The `text-delta` pieces joined and trimmed */
  reply: string;
  approvals: ChatApproval[];
  /** One entry per action id, in first-seen order; a later event for the same id replaces it (executed, then undone) */
  actions: ChatAction[];
  suggestions: string[];
  /** `done.awaitingReply` when Nerova sends it: whether the companion is waiting for the owner to answer */
  awaitingReply?: boolean;
  /** An `error` event: the reply failed after it started */
  error: ChatStreamError | null;
  /** A `done` event was seen */
  isDone: boolean;
}

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function parseLine(raw: unknown): ChatApprovalLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Json;
  const label = str(o.label);
  const to = str(o.to);
  return label && to ? { label, from: str(o.from), to } : null;
}

function parseApproval(data: Json): ChatApproval | null {
  const id = str(data.id);
  const kind = str(data.kind);
  const title = str(data.title);
  if (!id || !kind || !title) return null;
  const lines = Array.isArray(data.lines) ? data.lines.map(parseLine).filter((l): l is ChatApprovalLine => l !== null) : [];
  return { id, kind, title, lines, expiresAt: str(data.expiresAt) };
}

export function parseAction(data: Json): ChatAction | null {
  const id = str(data.id);
  const kind = str(data.kind);
  const status = data.status === 'executed' || data.status === 'undone' ? data.status : null;
  if (!id || !kind || !status) return null;
  const lines = Array.isArray(data.lines) ? data.lines.map(parseLine).filter((l): l is ChatApprovalLine => l !== null) : [];
  const undoneAt = str(data.undoneAt);
  return {
    id,
    kind,
    status,
    title: str(data.title) ?? '',
    readBack: str(data.readBack) ?? '',
    lines,
    executedAt: str(data.executedAt),
    undoUntil: str(data.undoUntil),
    undoable: data.undoable === true && status === 'executed',
    ...(undoneAt ? { undoneAt } : {}),
  };
}

/** Splits the body into `{ event, data }` frames; a frame is lines up to a blank line. */
function frames(body: string): { event: string; data: string }[] {
  const out: { event: string; data: string }[] = [];
  for (const block of body.replace(/\r\n?/g, '\n').split('\n\n')) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length > 0) out.push({ event, data: data.join('\n') });
  }
  return out;
}

export function parseChatStream(body: string): ChatTurn {
  const turn: ChatTurn = { reply: '', approvals: [], actions: [], suggestions: [], error: null, isDone: false };
  let reply = '';
  for (const frame of frames(body)) {
    let data: Json;
    try {
      const parsed: unknown = JSON.parse(frame.data);
      if (typeof parsed !== 'object' || parsed === null) continue;
      data = parsed as Json;
    } catch {
      continue; // a malformed frame never fails the turn
    }
    switch (frame.event) {
      case 'text-delta':
        if (typeof data.delta === 'string') reply += data.delta;
        break;
      case 'approval': {
        const approval = parseApproval(data);
        if (approval) turn.approvals.push(approval);
        break;
      }
      case 'action': {
        const action = parseAction(data);
        if (!action) break;
        const at = turn.actions.findIndex((a) => a.id === action.id);
        if (at >= 0) turn.actions[at] = action;
        else turn.actions.push(action);
        break;
      }
      case 'done':
        turn.isDone = true;
        if (Array.isArray(data.suggestions)) turn.suggestions = data.suggestions.filter((s): s is string => typeof s === 'string');
        if (typeof data.awaitingReply === 'boolean') turn.awaitingReply = data.awaitingReply;
        break;
      case 'error':
        turn.error = { code: str(data.code) ?? 'companion.turn_failed', message: str(data.message) ?? '', retryable: data.retryable === true };
        break;
      default:
        break; // tool, widget and unknown events are not needed for a spoken reply
    }
  }
  turn.reply = reply.trim();
  return turn;
}
