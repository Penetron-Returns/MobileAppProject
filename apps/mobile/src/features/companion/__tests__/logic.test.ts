import {
  buildEmbedHtml,
  deriveConnectCard,
  maskConnectedPhone,
  type ConnectPhase,
  clovieMood,
  IDLE_ACTIVITY,
  reduceActivity,
  REPLIED_MS,
  type ChatActivity,
  type WidgetEvent,
  notReadyKey,
  parseWidgetMessage,
  refreshDelayMs,
  draftScript,
  frameOrigin,
  isDraftSentMessage,
  MAX_DRAFT_CHARS,
  truncateDraft,
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
    [msg({ type: 'nerova:widget', event: 'busy' }), { kind: 'busy' }],
    [msg({ type: 'nerova:widget', event: 'reply' }), { kind: 'reply' }],
    [msg({ type: 'nerova:widget', event: 'idle' }), { kind: 'idle' }],
    [
      msg({
        type: 'nerova:widget',
        version: 1,
        widget: 'owner-chat',
        sessionId: 's1',
        event: 'busy',
      }),
      { kind: 'busy' },
    ],
    [msg({ type: 'nerova:widget', widget: 'other-chat', event: 'busy' }), null],
    [msg({ type: 'nerova:widget', event: 'reply_started' }), null],
    [msg({ type: 'nerova:widget', event: 'reply_finished' }), null],
    [msg({ type: 'nerova:widget', kind: 'ready' }), null],
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
  it('only trusts messages from the frame origin and its own window', () => {
    const page = buildEmbedHtml('https://chat.nerova.example/s/abc?x=1');
    expect(page).toContain('var origin="https://chat.nerova.example"');
    expect(page).toContain('e.origin!==origin');
    expect(page).toContain('e.source!==frame.contentWindow');
    // The origin check comes before anything is relayed.
    expect(page.indexOf('e.origin!==origin')).toBeLessThan(
      page.indexOf('bridge({type:d.type'),
    );
  });
  it('posts drafts to the exact frame origin and only after ready', () => {
    const page = buildEmbedHtml('https://chat.nerova.example/s/abc');
    expect(page).toContain("type:'nerova:widget-draft'");
    expect(page).toContain('draftText:draft},origin)');
    expect(page).not.toContain("},'*')");
    // flush() refuses to post until ready; ready is what triggers the flush.
    expect(page).toContain('if(!ready||!has||!origin');
    expect(page).toContain("if(d.event==='ready'){ready=true;flush()}");
    expect(page).toContain('window.__clovieSetDraft=');
  });
  it('drops every message and draft when the URL has no usable origin', () => {
    expect(buildEmbedHtml('not a url')).toContain('var origin=null');
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
      'starts thinking on busy',
      IDLE_ACTIVITY,
      { kind: 'busy' },
      at500('thinking'),
    ],
    [
      'restarts thinking after a reply',
      replied,
      { kind: 'busy' },
      at500('thinking'),
    ],
    [
      'keeps thinking on a duplicate busy',
      thinking,
      { kind: 'busy' },
      thinking,
    ],
    ['replies after busy', thinking, { kind: 'reply' }, at500('replied')],
    [
      'replies without a busy first',
      IDLE_ACTIVITY,
      { kind: 'reply' },
      at500('replied'),
    ],
    [
      'goes idle after busy with no reply',
      thinking,
      { kind: 'idle' },
      at500('idle'),
    ],
    [
      'stays idle (no bounce) on idle',
      IDLE_ACTIVITY,
      { kind: 'idle' },
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

describe('deriveConnectCard', () => {
  const setup = (next_step: string, connected = false) =>
    ({ next_step, whatsapp: { connected } }) as never;
  const base = {
    isOwner: true,
    phase: 'idle' as ConnectPhase,
    isCollapsed: false,
  };

  it.each([
    [
      'owner at connect_whatsapp',
      { setup: setup('connect_whatsapp') },
      'prompt',
    ],
    ['owner at go_live', { setup: setup('go_live', true) }, 'hidden'],
    ['owner at none', { setup: setup('none', true) }, 'hidden'],
    ['setup not loaded', { setup: undefined }, 'hidden'],
    [
      'staff never see it',
      { setup: setup('connect_whatsapp'), isOwner: false },
      'hidden',
    ],
    [
      'staff even when connected mid-flow',
      { setup: setup('go_live', true), isOwner: false, phase: 'waiting' },
      'hidden',
    ],
    [
      'collapsed',
      { setup: setup('connect_whatsapp'), isCollapsed: true },
      'hidden',
    ],
    [
      'minting the launch URL',
      { setup: setup('connect_whatsapp'), phase: 'starting' },
      'starting',
    ],
    [
      'tab open, not connected yet',
      { setup: setup('connect_whatsapp'), phase: 'waiting' },
      'waiting',
    ],
    [
      'connected while waiting (next step moved on)',
      { setup: setup('go_live', true), phase: 'waiting' },
      'connected',
    ],
    [
      'connected right after starting',
      { setup: setup('go_live', true), phase: 'starting' },
      'connected',
    ],
    [
      'connect failed',
      { setup: setup('connect_whatsapp'), phase: 'failed' },
      'failed',
    ],
    [
      'already connected answer',
      { setup: setup('connect_whatsapp'), phase: 'already_connected' },
      'connected',
    ],
    [
      'already connected, setup not loaded',
      { setup: undefined, phase: 'already_connected' },
      'connected',
    ],
    [
      'already connected then collapsed',
      { setup: undefined, phase: 'already_connected', isCollapsed: true },
      'hidden',
    ],
  ] as [string, Partial<Parameters<typeof deriveConnectCard>[0]>, string][])(
    '%s',
    (_name, over, expected) => {
      expect(deriveConnectCard({ ...base, setup: undefined, ...over })).toBe(
        expected,
      );
    },
  );
});

describe('maskConnectedPhone', () => {
  it.each([
    ['+27 82 123 4567', '+27 ••• ••• 567'],
    ['+27821234567', '+27 ••• ••• 567'],
    ['27821234567', '+27 ••• ••• 567'],
    ['+1 (415) 555-0132', '+••• ••• 132'],
    ['+44 7700 900123', '+••• ••• 123'],
    ['123', ''],
    ['', ''],
    [null, ''],
    [undefined, ''],
  ])('masks %s as %s', (raw, expected) => {
    expect(maskConnectedPhone(raw)).toBe(expected);
  });
});

describe('frameOrigin', () => {
  it.each([
    ['https://chat.nerova.example/s/abc?t=1#x', 'https://chat.nerova.example'],
    ['http://localhost:3000/s', 'http://localhost:3000'],
    ['https://chat.example:8443/s', 'https://chat.example:8443'],
    ['javascript:alert(1)', null],
    ['not a url', null],
    ['', null],
  ])('reads %s as %s', (url, expected) => {
    expect(frameOrigin(url)).toBe(expected);
  });
});

describe('truncateDraft', () => {
  it('keeps short text and the empty string', () => {
    expect(truncateDraft('')).toBe('');
    expect(truncateDraft('hello')).toBe('hello');
  });
  it('keeps exactly the limit', () => {
    const text = 'a'.repeat(MAX_DRAFT_CHARS);
    expect(truncateDraft(text)).toBe(text);
  });
  it('cuts to the limit', () => {
    expect(truncateDraft('a'.repeat(MAX_DRAFT_CHARS + 50))).toHaveLength(
      MAX_DRAFT_CHARS,
    );
  });
  it('does not split a surrogate pair at the cut', () => {
    const text = 'a'.repeat(MAX_DRAFT_CHARS - 1) + '😀';
    expect(truncateDraft(text)).toBe('a'.repeat(MAX_DRAFT_CHARS - 1));
  });
});

describe('draftScript', () => {
  it('passes the text as a JSON string literal, not as code', () => {
    const hostile = 'x");alert(1);(" </script>  ';
    const script = draftScript(hostile);
    expect(script).toBe(
      'window.__clovieSetDraft&&window.__clovieSetDraft(' +
        JSON.stringify(hostile) +
        ');true;',
    );
  });
  it('truncates long text', () => {
    const script = draftScript('a'.repeat(MAX_DRAFT_CHARS + 10));
    expect(script).toContain('a'.repeat(MAX_DRAFT_CHARS));
    expect(script).not.toContain('a'.repeat(MAX_DRAFT_CHARS + 1));
  });
});

describe('isDraftSentMessage', () => {
  it.each([
    [JSON.stringify({ type: 'clovie:draft-sent' }), true],
    [JSON.stringify({ type: 'nerova:widget', event: 'ready' }), false],
    ['not json', false],
    ['null', false],
  ])('reads %s as %s', (raw, expected) => {
    expect(isDraftSentMessage(raw)).toBe(expected);
  });
});
