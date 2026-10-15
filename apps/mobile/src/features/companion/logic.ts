import type {
  CompanionNotReadyDetails,
  CompanionNotReadyReason,
  CompanionSetupDTO,
} from '@booking/types';

/** Mint the next session this long before the current one ends. */
export const REFRESH_LEAD_MS = 60_000;
/** After a failed early refresh, try again this often until the session ends. */
export const REFRESH_RETRY_MS = 30_000;

/**
 * Milliseconds until the next session should be minted: one minute before
 * `expiresAt`, never negative (an already-short session refreshes at once).
 */
export function refreshDelayMs(expiresAt: string, now: number): number {
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(end - REFRESH_LEAD_MS - now, 0);
}

/**
 * What Nerova's frame tells the host page. `busy`, `reply` and `idle` are the
 * activity events: every `busy` is followed by exactly one `reply` (an answer
 * landed) or `idle` (it ended without one).
 */
export type WidgetEvent =
  | { kind: 'ready' }
  | { kind: 'resize' }
  | { kind: 'session_expired' }
  | { kind: 'error' }
  | { kind: 'busy' }
  | { kind: 'reply' }
  | { kind: 'idle' };

const WIDGET_NAME = 'owner-chat';

/**
 * Reads a message the bridge relayed from the frame. Anything that is not an
 * `owner-chat` `nerova:widget` event with a known name (or not JSON) is ignored.
 */
export function parseWidgetMessage(raw: string): WidgetEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.type !== 'nerova:widget') return null;
  if (msg.widget !== undefined && msg.widget !== WIDGET_NAME) return null;
  const event = msg.event;
  if (
    event === 'ready' ||
    event === 'resize' ||
    event === 'busy' ||
    event === 'reply' ||
    event === 'idle'
  ) {
    return { kind: event };
  }
  if (event === 'error') {
    const reason = String(msg.reason ?? '').replace(/-/g, '_');
    return reason === 'session_expired'
      ? { kind: 'session_expired' }
      : { kind: 'error' };
  }
  return null;
}

/** The page tells the app the queued draft reached the frame. */
export function isDraftSentMessage(raw: string): boolean {
  try {
    const data: unknown = JSON.parse(raw);
    return (
      !!data &&
      typeof data === 'object' &&
      (data as Record<string, unknown>).type === 'clovie:draft-sent'
    );
  } catch {
    return false;
  }
}

/** The origin of Nerova's frame, or null when the URL is not an http(s) URL. */
export function frameOrigin(sessionUrl: string): string | null {
  try {
    const url = new URL(sessionUrl);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** Nerova cuts a draft at this many characters; so do we, before sending. */
export const MAX_DRAFT_CHARS = 4000;

/** Cuts a draft to MAX_DRAFT_CHARS without splitting a surrogate pair. */
export function truncateDraft(text: string): string {
  if (text.length <= MAX_DRAFT_CHARS) return text;
  const last = text.charCodeAt(MAX_DRAFT_CHARS - 1);
  const isHighSurrogate = last >= 0xd800 && last <= 0xdbff;
  return text.slice(0, isHighSurrogate ? MAX_DRAFT_CHARS - 1 : MAX_DRAFT_CHARS);
}

/**
 * The script that hands a draft to the embed page. The text goes in as a JSON
 * string literal, never spliced into code.
 */
export function draftScript(text: string): string {
  // JSON is valid JS (U+2028/2029 included since ES2019), so this is a safe literal.
  const literal = JSON.stringify(truncateDraft(text));
  return `window.__clovieSetDraft&&window.__clovieSetDraft(${literal});true;`;
}

/** If the widget has not said `ready` this long after opening, show the transcript instead. */
export const DRAFT_READY_TIMEOUT_MS = 10_000;

/** How long Clovie keeps the "reply landed" reaction before going idle. */
export const REPLIED_MS = 1500;

export type ClovieMood = 'idle' | 'thinking' | 'replied';

/** What the chat last did, and when (ms since epoch, from an injected clock). */
export interface ChatActivity {
  phase: ClovieMood;
  since: number;
}

export const IDLE_ACTIVITY: ChatActivity = { phase: 'idle', since: 0 };

/** Folds a widget event into the chat activity; events that say nothing about replies change nothing. */
export function reduceActivity(
  activity: ChatActivity,
  event: WidgetEvent,
  now: number,
): ChatActivity {
  switch (event.kind) {
    case 'busy':
      return activity.phase === 'thinking'
        ? activity
        : { phase: 'thinking', since: now };
    case 'reply':
      return { phase: 'replied', since: now };
    case 'idle':
      return activity.phase === 'idle'
        ? activity
        : { phase: 'idle', since: now };
    case 'error':
    case 'session_expired':
      return { phase: 'idle', since: now };
    default:
      return activity;
  }
}

/** The mood at `now`: "replied" decays to idle after REPLIED_MS. */
export function clovieMood(activity: ChatActivity, now: number): ClovieMood {
  if (activity.phase === 'replied' && now - activity.since >= REPLIED_MS) {
    return 'idle';
  }
  return activity.phase;
}

/** Escapes a value for a double-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The embed page's script. It only trusts messages from the Nerova frame
 * (exact origin and the iframe's own window), relays them to the app, and
 * posts a queued draft into the frame once the frame has said `ready`.
 */
function embedScript(origin: string | null): string {
  const originLiteral = JSON.stringify(origin);
  return `(function(){var frame=document.getElementById('companion');var origin=${originLiteral};var MAX=${MAX_DRAFT_CHARS};var ready=false,has=false,draft='';function bridge(o){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(o))}function flush(){if(!ready||!has||!origin||!frame.contentWindow)return;frame.contentWindow.postMessage({type:'nerova:widget-draft',draftText:draft},origin);has=false;bridge({type:'clovie:draft-sent'})}window.__clovieSetDraft=function(text){if(typeof text!=='string')return;var t=text;if(t.length>MAX){t=t.slice(0,MAX);var c=t.charCodeAt(MAX-1);if(c>=55296&&c<=56319)t=t.slice(0,MAX-1)}draft=t;has=true;flush()};window.addEventListener('message',function(e){if(!origin||e.origin!==origin||e.source!==frame.contentWindow)return;var d=e.data;if(typeof d==='string'){try{d=JSON.parse(d)}catch(_){return}}if(!d||d.type!=='nerova:widget')return;if(d.event==='ready'){ready=true;flush()}bridge({type:d.type,version:d.version,widget:d.widget,event:d.event,reason:d.reason})})})();`;
}

/**
 * The page the WebView loads (with `baseUrl` set to the allowlisted origin):
 * one full-size sandboxed frame of the session URL, and a bridge that relays
 * Nerova's `nerova:widget` messages to the app and the app's draft to the frame.
 */
export function buildEmbedHtml(sessionUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:0;background:transparent}</style></head><body><iframe id="companion" title="Companion" src="${attr(sessionUrl)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="clipboard-write"></iframe><script>${embedScript(frameOrigin(sessionUrl))}</script></body></html>`;
}

/** Nerova's `nextStep` values the app has words for. */
const NEXT_STEPS = new Set([
  'connect_booking_system',
  'verify_booking_connection',
  'provision_account',
  'connect_whatsapp',
  'go_live',
]);

const REASONS: ReadonlySet<CompanionNotReadyReason> = new Set([
  'account_not_found',
  'account_not_available',
  'origin_not_registered',
  'key_not_authorized',
  'not_provisioned',
  'setup_incomplete',
  'unavailable',
]);

/**
 * The i18n key (under `companion.notReady`) for a COMPANION_NOT_READY answer:
 * the most specific thing known. A known `next_step` wins, then the
 * `reason`, then a generic line.
 */
export function notReadyKey(
  details: Record<string, unknown> | undefined,
): string {
  const d = (details ?? {}) as Partial<CompanionNotReadyDetails>;
  if (d.next_step && NEXT_STEPS.has(d.next_step)) return `steps.${d.next_step}`;
  if (d.reason && REASONS.has(d.reason)) return `reasons.${d.reason}`;
  return 'generic';
}

/** How often to ask whether WhatsApp is connected while the connect tab is open. */
export const WHATSAPP_POLL_MS = 3_000;
/** Stop asking this long after the owner starts connecting. */
export const WHATSAPP_POLL_WINDOW_MS = 180_000;

/** Where the owner is in the connect flow (the card's own progress, not the server's). */
export type ConnectPhase =
  'idle' | 'starting' | 'waiting' | 'failed' | 'already_connected';

export type ConnectCardState =
  'hidden' | 'prompt' | 'starting' | 'waiting' | 'failed' | 'connected';

/**
 * What the "Connect WhatsApp" card shows. Staff never see it. Once the owner
 * has started, a connected answer (or WHATSAPP_ALREADY_CONNECTED) wins even
 * though the server's next step has moved on; an owner who opens the sheet
 * with WhatsApp already connected sees no card.
 */
export function deriveConnectCard(input: {
  isOwner: boolean;
  setup: Pick<CompanionSetupDTO, 'next_step' | 'whatsapp'> | undefined;
  phase: ConnectPhase;
  isCollapsed: boolean;
}): ConnectCardState {
  const { isOwner, setup, phase, isCollapsed } = input;
  if (!isOwner || isCollapsed) return 'hidden';
  if (phase === 'already_connected') return 'connected';
  if (phase === 'idle') {
    return setup?.next_step === 'connect_whatsapp' ? 'prompt' : 'hidden';
  }
  return setup?.whatsapp.connected ? 'connected' : phase;
}

/**
 * The number for the success line, masked except the last three digits:
 * "+27 ••• ••• 567". Empty when there is nothing usable to show.
 */
export function maskConnectedPhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  const prefix = digits.startsWith('27') ? '+27 ' : '+';
  return `${prefix}••• ••• ${digits.slice(-3)}`;
}
