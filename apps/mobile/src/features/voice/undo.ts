/**
 * Act-then-undo by voice. A low-risk booking runs at once and Clovie reads back what it did ("Done. Thandi Ngwenya, Gel
 * Manicure, Saturday 17 October at 10:00. Say undo if that's wrong."). For the undo window the service listens once more
 * (a passive window: the executed action never sets `awaitingReply`). A clear undo phrase undoes exactly the action
 * that was just read, by id; anything else is a normal request; silence ends quietly. Pure apart from the injected
 * `undo` call, so it is unit tested without a phone. Never logs text, replies or names.
 */
import type { ClovieVoiceCommandOutcome } from './clovieVoice';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** The part of a `VoiceActionDTO` the voice flow reads. */
export interface ExecutedAction {
  id: string;
  status: 'executed' | 'undone';
  title: string;
  readBack: string;
  lines: readonly { label: string; from: string | null; to: string }[];
  /** ISO-8601 UTC */
  undoUntil: string | null;
  undoable: boolean;
}

export interface UndoDeps {
  t: Translate;
  /** Undoes exactly `id` (`POST /v1/voice/actions/:id/undo`). */
  undo: (id: string) => Promise<unknown>;
}

// ---- the undo phrase ----

/** Whole utterances that undo (after filler is dropped). A bare "no" or "stop" is deliberately not here. */
const UNDO_PHRASES = new Set([
  'undo',
  'undo that',
  'undo it',
  'undo this',
  'cancel that',
  'cancel it',
  'no wait',
  'wait no',
  'no no wait',
  'scratch that',
  'take that back',
  'take it back',
  "that's wrong",
  "that's not right",
  "that's incorrect",
  "that's not what i said",
  'that was wrong',
  'that is wrong',
  'that is not right',
  'revert that',
]);

/** Words around a phrase that do not change it. */
const FILLER = new Set([
  'clovie',
  'hey',
  'please',
  'ok',
  'okay',
  'um',
  'uh',
  'oh',
  'sorry',
  'actually',
]);

/** "Don't undo it" is the opposite of an undo. */
const NEGATIONS = new Set(["don't", 'dont', 'not', 'never']);

/** "undo" anywhere in a short sentence ("can you undo that please") still counts; a long one is a request. */
const MAX_UNDO_WORDS = 6;

function normalise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bthats\b/g, "that's")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0 && !FILLER.has(w));
}

/**
 * Whether an utterance asks to undo the last action. Deterministic: a listed phrase, or "undo" as a word in a short
 * sentence. "No" and "stop" alone never undo (they are answers to other questions), and a long sentence that happens
 * to contain "undo" goes to the companion as a normal request.
 */
export function isUndoPhrase(text: string): boolean {
  const words = normalise(text);
  if (words.length === 0 || words.length > MAX_UNDO_WORDS) return false;
  if (UNDO_PHRASES.has(words.join(' '))) return true;
  return words.includes('undo') && !words.some((w) => NEGATIONS.has(w));
}

// ---- the window ----

/** `undoUntil` as epoch ms, or null when missing or not a date. */
export function parseUndoUntil(
  undoUntil: string | null | undefined,
): number | null {
  if (!undoUntil) return null;
  const ms = Date.parse(undoUntil);
  return Number.isFinite(ms) ? ms : null;
}

/** Whether the undo window is still open at `nowMs`. No window (null) is closed. */
export function isUndoWindowOpen(
  undoUntilMs: number | null | undefined,
  nowMs: number,
): boolean {
  return typeof undoUntilMs === 'number' && undoUntilMs > nowMs;
}

/** Whole seconds left in the window, never below 0 (what the drawer's countdown shows). */
export function undoSecondsLeft(undoUntilMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((undoUntilMs - nowMs) / 1000));
}

// ---- outcomes ----

/** The first executed, still-undoable action of a reply, or undefined. */
export function pickExecutedAction(
  actions: readonly ExecutedAction[] | undefined,
): ExecutedAction | undefined {
  return actions?.find((a) => a.status === 'executed' && a.undoable);
}

/** Markdown noise dropped, whitespace tidied: plain words for the speaker and the screen. */
export function plainReadBack(text: string): string {
  return text
    .replace(/[*_`#~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The outcome that reads the executed action back and keeps a passive undo window: the service listens once more until
 * `undoUntil`, and "undo" then applies to this id only. When the window is already closed (or there is none), the
 * read-back is just spoken and nothing is listened for.
 */
export function actionOutcome(
  action: ExecutedAction,
  nowMs: number,
): ClovieVoiceCommandOutcome {
  const readBack = plainReadBack(action.readBack || action.title);
  const undoUntilMs = parseUndoUntil(action.undoUntil);
  if (!readBack) return { status: 'done', message: '' };
  if (!isUndoWindowOpen(undoUntilMs, nowMs) || undoUntilMs === null) {
    return { status: 'done', message: readBack, spoken: readBack };
  }
  return {
    status: 'done',
    message: readBack,
    spoken: readBack,
    expectsReply: true,
    pendingActionId: action.id,
    undoUntilMs,
  };
}

const detailsReason = (error: unknown): string => {
  const { details } = (error ?? {}) as { details?: { reason?: unknown } };
  return typeof details?.reason === 'string' ? details.reason : '';
};
const codeOf = (error: unknown): string => {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' ? code : '';
};

function undoFailure(error: unknown, t: Translate): ClovieVoiceCommandOutcome {
  const reason = detailsReason(error);
  if (codeOf(error) === 'NOT_SIGNED_IN' || codeOf(error) === 'NOT_CONFIGURED') {
    return { status: 'open_app', message: '' };
  }
  if (
    codeOf(error) === 'RULE_VIOLATION' &&
    (reason === 'action.undo_window_closed' || reason === 'action.not_undoable')
  ) {
    return { status: 'error', message: t('voice.undo.tooLate') };
  }
  return { status: 'error', message: t('voice.undo.failed') };
}

/**
 * Undoes exactly `actionId` (the one just read aloud, carried by the service) and says so. Never takes an id from
 * anywhere else. The outcome sets no pending action, so the window closes.
 */
export async function undoPendingAction(
  actionId: string,
  deps: UndoDeps,
): Promise<ClovieVoiceCommandOutcome> {
  try {
    await deps.undo(actionId);
  } catch (error) {
    return undoFailure(error, deps.t);
  }
  const message = deps.t('voice.undo.done');
  return { status: 'done', message, spoken: message };
}
