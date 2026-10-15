import {
  buildEmbedHtml,
  detentHeight,
  notReadyKey,
  parseWidgetMessage,
  refreshDelayMs,
  settleDetent,
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

describe('settleDetent', () => {
  const height = 800;
  it.each([
    ['half, small drag stays', 'half', 10, 0, 'half'],
    ['half, drag up goes full', 'half', -150, 0, 'full'],
    ['half, fling up goes full', 'half', -20, -1200, 'full'],
    ['half, long drag down closes', 'half', 250, 0, 'close'],
    ['half, hard fling down closes', 'half', 30, 1500, 'close'],
    ['half, short pull down stays', 'half', 120, 0, 'half'],
    ['full, small drag stays', 'full', 20, 0, 'full'],
    ['full, drag down goes half', 'full', 150, 0, 'half'],
    ['full, fling down goes half', 'full', 10, 1000, 'half'],
  ] as const)('%s', (_n, from, offset, velocity, expected) => {
    expect(settleDetent({ from, offset, velocity, height })).toBe(expected);
  });
});

describe('detentHeight', () => {
  it('is the usable height at full and a fraction at half', () => {
    expect(detentHeight('full', 800)).toBe(800);
    expect(detentHeight('half', 800)).toBe(464);
  });
});
