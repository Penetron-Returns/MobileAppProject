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

// ---- incremental parsing (voice streaming) ----

/** What the Nerova stream carries, one item per SSE frame we care about. Text arrives first; cards come after it. */
export type ChatStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'approval'; approval: ChatApproval }
  | { type: 'action'; action: ChatAction }
  | { type: 'done'; suggestions: string[]; awaitingReply?: boolean; timing?: NerovaTurnTiming }
  | { type: 'error'; error: ChatStreamError };

/** `done.timing` from Nerova's voice mode; every entry is null when Nerova did not send it. */
export interface NerovaTurnTiming {
  ttftMs: number | null;
  llmMs: number | null;
  toolsMs: number | null;
  totalMs: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

function parseTiming(raw: unknown): NerovaTurnTiming | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Json;
  const timing = { ttftMs: num(o.ttftMs), llmMs: num(o.llmMs), toolsMs: num(o.toolsMs), totalMs: num(o.totalMs) };
  return Object.values(timing).some((v) => v !== null) ? timing : undefined;
}

/** One SSE frame to an event; null for frames we do not need (tool, widget, unknown) or that are malformed. */
export function toChatStreamEvent(frame: { event: string; data: string }): ChatStreamEvent | null {
  let data: Json;
  try {
    const parsed: unknown = JSON.parse(frame.data);
    if (typeof parsed !== 'object' || parsed === null) return null;
    data = parsed as Json;
  } catch {
    return null;
  }
  switch (frame.event) {
    case 'text-delta':
      return typeof data.delta === 'string' && data.delta.length > 0 ? { type: 'text-delta', delta: data.delta } : null;
    case 'approval': {
      const approval = parseApproval(data);
      return approval ? { type: 'approval', approval } : null;
    }
    case 'action': {
      const action = parseAction(data);
      return action ? { type: 'action', action } : null;
    }
    case 'done': {
      const suggestions = Array.isArray(data.suggestions) ? data.suggestions.filter((s): s is string => typeof s === 'string') : [];
      const timing = parseTiming(data.timing);
      return {
        type: 'done',
        suggestions,
        ...(typeof data.awaitingReply === 'boolean' ? { awaitingReply: data.awaitingReply } : {}),
        ...(timing ? { timing } : {}),
      };
    }
    case 'error':
      return { type: 'error', error: { code: str(data.code) ?? 'companion.turn_failed', message: str(data.message) ?? '', retryable: data.retryable === true } };
    default:
      return null;
  }
}

/**
 * Feeds SSE text in arbitrary chunks and returns the complete frames each chunk finished. A frame ends at a blank
 * line, so a chunk that stops mid-frame (or mid-line, or between CR and LF) is held until the rest arrives.
 */
export function createSseDecoder(): { push(chunk: string): { event: string; data: string }[]; flush(): { event: string; data: string }[] } {
  let buffer = '';
  const drain = (final: boolean) => {
    const normalised = buffer.replace(/\r\n?/g, '\n');
    // A trailing lone CR may be the first half of CRLF: keep it until the next chunk unless the stream ended.
    const hold = !final && buffer.endsWith('\r');
    const text = hold ? normalised.slice(0, -1) : normalised;
    const boundary = text.lastIndexOf('\n\n');
    if (!final && boundary < 0) return [];
    const cut = final ? text.length : boundary + 2;
    const ready = text.slice(0, cut);
    buffer = text.slice(cut) + (hold ? '\r' : '');
    return frames(ready);
  };
  return {
    push(chunk) {
      buffer += chunk;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}
