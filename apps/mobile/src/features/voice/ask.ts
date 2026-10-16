/**
 * Everything the owner says that is not "client has arrived" goes to the real Nerova companion (Clovie) through
 * `POST /v1/voice/ask`, and the reply is spoken. Approvals (a booking, move or cancel) are read aloud one at a time and
 * a spoken yes or no is bound to the approval id that was just read, never to "the latest pending". Pure apart from the
 * injected `ask` / `decide` calls, so it is unit tested without a phone. Never logs text, replies or names.
 */
import type { ClovieVoiceCommandOutcome } from './clovieVoice';

type Translate = (key: string, values?: Record<string, unknown>) => string;

export interface AskApproval {
  id: string;
  kind: string;
  title: string;
}

export interface AskResult {
  reply: string;
  approvals: readonly AskApproval[];
  suggestions?: readonly string[];
}

export interface AskDeps {
  t: Translate;
  ask: (text: string) => Promise<AskResult>;
  /** Decides exactly `id`. */
  decide: (
    id: string,
    decision: 'approve' | 'decline',
  ) => Promise<{ kind: string | null }>;
}

/** What the service hands back from the previous turn: the approval just read aloud and those still to read. */
export interface FollowUpContext {
  pendingApprovalId?: string | undefined;
  pendingKind?: string | undefined;
  /** JSON `[{ id, kind, title }]`, as the previous outcome produced it. */
  pendingQueue?: string | undefined;
}

// ---- yes / no ----

export type ReplyClass = 'yes' | 'no' | 'other';

const YES = new Set([
  'yes',
  'yeah',
  'yep',
  'sure',
  'ok',
  'okay',
  'confirm',
  'do it',
  'go ahead',
  'please',
]);
const NO = new Set(['no', 'nope', 'cancel', "don't", 'stop', 'never mind']);
/** Words that may sit around a yes or no without changing it. */
const FILLER = new Set(['clovie', 'hey', 'thanks', 'thank', 'you', 'um', 'uh']);
const PHRASES = ['do it', 'go ahead', 'never mind'] as const;

/** Joins the two-word phrases into one token; `dont` and `do not` become `don't`. */
function tokens(text: string): string[] {
  let s = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\bdo not\b|\bdont\b/g, "don't")
    .replace(/\s+/g, ' ')
    .trim();
  for (const phrase of PHRASES)
    s = s.split(phrase).join(phrase.replace(' ', '_'));
  return s ? s.split(' ').map((w) => w.replace('_', ' ')) : [];
}

/**
 * Classifies a follow-up as a clear yes, a clear no, or anything else. Only the listed words (and a little
 * filler) count: "yes but make it five" is `other`, so it goes back to the companion as a normal message.
 */
export function classifyReply(text: string): ReplyClass {
  const words = tokens(text);
  if (words.length === 0 || words.length > 5) return 'other';
  let yes = 0;
  let no = 0;
  for (const word of words) {
    if (YES.has(word)) yes += 1;
    else if (NO.has(word)) no += 1;
    else if (!FILLER.has(word)) return 'other';
  }
  if (yes > 0 && no === 0) return 'yes';
  if (no > 0 && yes === 0) return 'no';
  return 'other';
}

// ---- speaking an approval ----

const WEEKDAYS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};
const MONTHS: Record<string, string> = {
  jan: 'January',
  feb: 'February',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'September',
  sept: 'September',
  oct: 'October',
  nov: 'November',
  dec: 'December',
};
const MONTH_RE = Object.keys(MONTHS).join('|');
const WEEKDAY_RE = Object.keys(WEEKDAYS).join('|');
const cap = (s: string) => s.toLowerCase();

/**
 * Makes an approval card title speakable and nothing more: the client, service, date and time all stay, so the
 * owner knows exactly what she is approving. "Fri 16 Oct" becomes "Friday 16 October", "20:30-21:15" becomes
 * "20:30 to 21:15" (with an "at" when a comma set the time off), and markup noise is dropped.
 */
export function speakableApproval(title: string): string {
  return (
    title
      .replace(/[*_`#~]+/g, '')
      // Weekday and month: "Fri 16 Oct" -> "Friday 16 October"
      .replace(
        new RegExp(
          `\\b(${WEEKDAY_RE})\\.?,?\\s+(\\d{1,2})\\s+(${MONTH_RE})\\b\\.?`,
          'gi',
        ),
        (_m, wd: string, day: string, mon: string) =>
          `${WEEKDAYS[cap(wd)]} ${day} ${MONTHS[cap(mon)]}`,
      )
      // A date with no weekday: "16 Oct" -> "16 October"
      .replace(
        new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\b\\.?`, 'gi'),
        (_m, day: string, mon: string) => `${day} ${MONTHS[cap(mon)]}`,
      )
      // A time range: "20:30-21:15" -> "20:30 to 21:15"
      .replace(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/g, '$1 to $2')
      // ", 20:30" -> " at 20:30" so it reads as one sentence
      .replace(/,\s*(?=\d{1,2}:\d{2})/g, ' at ')
      .replace(/\s*[;|]\s*/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** The part of a long reply that is read aloud: whole sentences, at most `max` characters. */
export function trimForSpeech(reply: string, max = 400): string {
  const text = reply
    .replace(/[*_`#~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('? '),
    cut.lastIndexOf('! '),
  );
  return end > 0
    ? cut.slice(0, end + 1)
    : cut.slice(0, cut.lastIndexOf(' ')).trim();
}

// ---- outcomes ----

/** Pending approvals after the first, parsed defensively: anything malformed is dropped. */
export function parsePendingQueue(json: string | undefined): AskApproval[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is AskApproval =>
        typeof a === 'object' &&
        a !== null &&
        typeof (a as AskApproval).id === 'string' &&
        typeof (a as AskApproval).kind === 'string' &&
        typeof (a as AskApproval).title === 'string',
    );
  } catch {
    return [];
  }
}

const endsWithQuestion = (text: string) => /\?\s*["')\]]*$/.test(text.trim());

/**
 * The outcome that reads `approvals[0]` aloud and waits for a yes or no on exactly that id. `lead` is what was
 * said just before (the reply, or "Done. Booked.").
 */
function approvalOutcome(
  lead: { shown: string; spoken: string },
  approvals: readonly AskApproval[],
  t: Translate,
  intro = '',
): ClovieVoiceCommandOutcome {
  const [current, ...rest] = approvals as [AskApproval, ...AskApproval[]];
  const parts = [
    lead.spoken,
    intro,
    speakableApproval(current.title),
    t('voice.ask.sayYesOrNo'),
  ].filter((p) => p.length > 0);
  return {
    status: 'done',
    message: lead.shown || current.title,
    spoken: parts.join(' '),
    expectsReply: true,
    pendingApprovalId: current.id,
    pendingKind: current.kind,
    ...(rest.length > 0
      ? { pendingQueue: JSON.stringify(rest), pendingRemaining: rest.length }
      : {}),
  };
}

/** Sends `text` to the companion and turns its reply into an outcome to show and speak. */
export async function askCompanion(
  text: string,
  deps: AskDeps,
): Promise<ClovieVoiceCommandOutcome> {
  let result: AskResult;
  try {
    result = await deps.ask(text);
  } catch (error) {
    return askFailure(error, deps.t);
  }
  const reply = result.reply.trim();
  if (result.approvals.length > 0) {
    const intro =
      result.approvals.length > 1
        ? deps.t('voice.ask.several', { count: result.approvals.length })
        : '';
    return approvalOutcome(
      { shown: reply, spoken: trimForSpeech(reply) },
      result.approvals,
      deps.t,
      intro,
    );
  }
  if (!reply) return { status: 'done', message: deps.t('voice.ask.noReply') };
  return {
    status: 'done',
    message: reply,
    spoken: trimForSpeech(reply),
    ...(endsWithQuestion(reply) ? { expectsReply: true } : {}),
  };
}

const codeOf = (error: unknown): string => {
  const { code } = (error ?? {}) as { code?: unknown };
  return typeof code === 'string' ? code : '';
};

function askFailure(error: unknown, t: Translate): ClovieVoiceCommandOutcome {
  switch (codeOf(error)) {
    case 'NOT_SIGNED_IN':
    case 'NOT_CONFIGURED':
      return { status: 'open_app', message: '' };
    case 'FEATURE_NOT_IN_PLAN':
      return { status: 'error', message: t('voice.noCompanion') };
    case 'COMPANION_NOT_READY':
      return { status: 'error', message: t('voice.ask.notReady') };
    case 'RATE_LIMITED':
      return { status: 'error', message: t('voice.ask.busy') };
    default:
      return { status: 'error', message: t('voice.ask.failed') };
  }
}

function decideFailure(
  error: unknown,
  t: Translate,
): ClovieVoiceCommandOutcome {
  switch (codeOf(error)) {
    case 'NOT_FOUND':
    case 'WINDOW_CLOSED':
      return { status: 'error', message: t('voice.ask.expired') };
    case 'RULE_VIOLATION':
      return { status: 'error', message: t('voice.ask.refused') };
    case 'NOT_SIGNED_IN':
    case 'NOT_CONFIGURED':
      return { status: 'open_app', message: '' };
    default:
      return { status: 'error', message: t('voice.ask.approvalFailed') };
  }
}

const DONE_KEY: Record<string, string> = {
  create_appointment: 'voice.ask.done.booked',
  reschedule_appointment: 'voice.ask.done.moved',
  cancel_appointment: 'voice.ask.done.cancelled',
};

/** "Done. Booked." / "Done. Moved." / "Done. Cancelled." by the approval's kind. */
export function doneMessage(
  kind: string | null | undefined,
  t: Translate,
): string {
  return t((kind && DONE_KEY[kind]) || 'voice.ask.done.generic');
}

/**
 * A yes or no for the approval the service just read aloud. Calls approve or decline with `context.pendingApprovalId`
 * and nothing else. When more approvals are queued, the next one is read straight after, with its own id.
 */
export async function answerPendingApproval(
  verdict: 'yes' | 'no',
  context: Required<Pick<FollowUpContext, 'pendingApprovalId'>> &
    FollowUpContext,
  deps: AskDeps,
): Promise<ClovieVoiceCommandOutcome> {
  const { t } = deps;
  const id = context.pendingApprovalId;
  let lead: string;
  try {
    const result = await deps.decide(
      id,
      verdict === 'yes' ? 'approve' : 'decline',
    );
    lead =
      verdict === 'yes'
        ? doneMessage(result.kind ?? context.pendingKind, t)
        : t('voice.ask.declined');
  } catch (error) {
    return decideFailure(error, t);
  }
  const queue = parsePendingQueue(context.pendingQueue);
  if (queue.length === 0) return { status: 'done', message: lead };
  return approvalOutcome(
    { shown: `${lead} ${queue[0]!.title}`, spoken: lead },
    queue,
    t,
    t('voice.ask.next'),
  );
}
