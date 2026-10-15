import {
  buildEmbedHtml,
  clovieMood,
  IDLE_ACTIVITY,
  reduceActivity,
  REPLIED_MS,
  type ChatActivity,
  type WidgetEvent,
  notReadyKey,
  parseWidgetMessage,
  refreshDelayMs,
} from '../logic';

describe('notReadyKey', () => {
  it.each([
    [{ reason: 'account_not_found' }, 'reasons.account_not_found'],
    [{ reason: 'not_provisioned' }, 'reasons.not_provisioned'],
    [{ reason: 'account_not_available' }, 'reasons.account_not_available'],
    [{ reason: 'origin_not_registered' }, 'reasons.origin_not_registered'],
    [{ reason: 'key_not_authorized' }, 'reasons.key_not_authorized'],
    [{ reason: 'setup_incomplete' }, 'reasons.setup_incomplete'],
    [{ reason: 'unavailable' }, 'reasons.unavailable'],
    [
      { reason: 'setup_incomplete', next_step: 'connect_whatsapp' },
      'steps.connect_whatsapp',
    ],
    [{ reason: 'unavailable', next_step: 'go_live' }, 'steps.go_live'],
    [
      { reason: 'setup_incomplete', next_step: 'something_new' },
      'reasons.setup_incomplete',
    ],
    [{ reason: 'never_heard_of_it' }, 'generic'],
    [{}, 'generic'],
    [undefined, 'generic'],
  ])('maps %j to %s', (details, expected) => {
    expect(notReadyKey(details)).toBe(expected);
  });
});

describe('refreshDelayMs', () => {
  const now = Date.parse('2026-10-15T10:00:00Z');
  it.each([
    ['2026-10-15T10:15:00Z', 14 * 60_000],
    ['2026-10-15T10:01:00Z', 0],
    ['2026-10-15T09:00:00Z', 0],
    ['not a date', 0],
  ])('waits for %s', (expiresAt, expected) => {
    expect(refreshDelayMs(expiresAt, now)).toBe(expected);
  });
});

describe('parseWidgetMessage', () => {
  const msg = (o: unknown) => JSON.stringify(o);
  it.each([
    [msg({ type: 'nerova:widget', event: 'ready' }), { kind: 'ready' }],
    [msg({ type: 'nerova:widget', event: 'resize' }), { kind: 'resize' }],
    [
      msg({ type: 'nerova:widget', event: 'error', reason: 'session_expired' }),
      { kind: 'session_expired' },
    ],
    [
      msg({ type: 'nerova:widget', event: 'error', reason: 'session-expired' }),
      { kind: 'session_expired' },
    ],
    [
      msg({ type: 'nerova:widget', event: 'error', reason: 'load-timeout' }),
      { kind: 'error' },
    ],
    [
      msg({ type: 'nerova:widget', event: 'reply_started' }),
      { kind: 'reply_started' },
    ],
    [
      msg({ type: 'nerova:widget', event: 'reply_finished' }),
      { kind: 'reply_finished' },
    ],
    [msg({ type: 'other', event: 'ready' }), null],
    [msg({ type: 'nerova:widget', event: 'mystery' }), null],
    ['not json', null],
    ['null', null],
  ])('reads %s', (raw, expected) => {
    expect(parseWidgetMessage(raw)).toEqual(expected);
  });
});

describe('buildEmbedHtml', () => {
  const html = buildEmbedHtml('https://chat.example/s?token="a"&x=<b>');
  it('frames the session in a sandboxed full-size iframe', () => {
    expect(html).toContain(
      'sandbox="allow-scripts allow-same-origin allow-forms allow-popups"',
    );
    expect(html).toContain('<iframe');
    expect(html).toContain('position:fixed');
  });
  it('escapes the URL so it cannot break out of the attribute', () => {
    expect(html).toContain('token=&quot;a&quot;&amp;x=&lt;b&gt;');
    expect(html).not.toContain('token="a"');
  });
  it('relays nerova:widget messages to the app', () => {
    expect(html).toContain('nerova:widget');
    expect(html).toContain('ReactNativeWebView.postMessage');
  });
});

describe('reduceActivity', () => {
  const thinking: ChatActivity = { phase: 'thinking', since: 100 };
  const replied: ChatActivity = { phase: 'replied', since: 100 };
  const at500 = (phase: ChatActivity['phase']): ChatActivity => ({
    phase,
    since: 500,
  });
  it.each<[string, ChatActivity, WidgetEvent, ChatActivity]>([
    [
      'starts thinking',
      IDLE_ACTIVITY,
      { kind: 'reply_started' },
      at500('thinking'),
    ],
    [
      'restarts thinking after a reply',
      replied,
      { kind: 'reply_started' },
      at500('thinking'),
    ],
    [
      'replies after thinking',
      thinking,
      { kind: 'reply_finished' },
      at500('replied'),
    ],
    [
      'ignores a finish with nothing started',
      IDLE_ACTIVITY,
      { kind: 'reply_finished' },
      IDLE_ACTIVITY,
    ],
    ['goes idle on error', thinking, { kind: 'error' }, at500('idle')],
    [
      'goes idle on expiry',
      thinking,
      { kind: 'session_expired' },
      at500('idle'),
    ],
    ['ignores resize', thinking, { kind: 'resize' }, thinking],
    ['ignores ready', thinking, { kind: 'ready' }, thinking],
  ])('%s', (_name, from, event, expected) => {
    expect(reduceActivity(from, event, 500)).toEqual(expected);
  });
});

describe('clovieMood', () => {
  it.each<[ChatActivity, number, string]>([
    [IDLE_ACTIVITY, 10_000, 'idle'],
    [{ phase: 'thinking', since: 0 }, 60_000, 'thinking'],
    [{ phase: 'replied', since: 1000 }, 1000, 'replied'],
    [{ phase: 'replied', since: 1000 }, 1000 + REPLIED_MS - 1, 'replied'],
    [{ phase: 'replied', since: 1000 }, 1000 + REPLIED_MS, 'idle'],
  ])('reads %j at %d as %s', (activity, now, expected) => {
    expect(clovieMood(activity, now)).toBe(expected);
  });
});
