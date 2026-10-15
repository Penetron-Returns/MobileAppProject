import type {
  CompanionNotReadyDetails,
  CompanionNotReadyReason,
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

/** What Nerova's frame tells the host page. */
export type WidgetEvent =
  | { kind: 'ready' }
  | { kind: 'resize' }
  | { kind: 'session_expired' }
  | { kind: 'error' };

/**
 * Reads a message the bridge relayed from the frame. Anything that is not a
 * `nerova:widget` event (or not JSON) is ignored.
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
  const event = msg.event ?? msg.kind;
  if (event === 'ready' || event === 'resize') return { kind: event };
  if (event === 'error') {
    const reason = String(msg.reason ?? '').replace(/-/g, '_');
    return reason === 'session_expired'
      ? { kind: 'session_expired' }
      : { kind: 'error' };
  }
  return null;
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
 * The page the WebView loads (with `baseUrl` set to the allowlisted origin):
 * one full-size sandboxed frame of the session URL, and a bridge that relays
 * Nerova's `nerova:widget` messages to the app.
 */
export function buildEmbedHtml(sessionUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:0;background:transparent}</style></head><body><iframe title="Companion" src="${attr(sessionUrl)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="clipboard-write"></iframe><script>window.addEventListener('message',function(e){var d=e.data;if(typeof d==='string'){try{d=JSON.parse(d)}catch(_){return}}if(d&&d.type==='nerova:widget'&&window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:d.type,event:d.event,reason:d.reason}))}});</script></body></html>`;
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

/** Sheet detents as fractions of the usable height; `closed` is below the half detent. */
export type Detent = 'half' | 'full';

export const HALF_FRACTION = 0.58;

/**
 * Where a released drag settles. `offset` is how far the sheet's top has moved
 * from its current detent (positive = down), `velocity` is px/s (positive = down).
 * A fling or a long drag changes detent; a hard pull down from half closes.
 */
export function settleDetent(opts: {
  from: Detent;
  offset: number;
  velocity: number;
  height: number;
}): Detent | 'close' {
  const { from, offset, velocity, height } = opts;
  const FLING = 800;
  const far = height * 0.12;
  const goDown = velocity > FLING || offset > far;
  const goUp = velocity < -FLING || offset < -far;
  if (from === 'full') return goDown ? 'half' : 'full';
  if (goUp) return 'full';
  return goDown && (velocity > FLING * 1.5 || offset > height * 0.25)
    ? 'close'
    : 'half';
}

/** Sheet height in px for a detent, given the usable height under the status bar. */
export function detentHeight(detent: Detent, usable: number): number {
  return detent === 'full' ? usable : Math.round(usable * HALF_FRACTION);
}
