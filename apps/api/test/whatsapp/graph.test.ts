import { describe, expect, it } from 'vitest';

import { classifyMetaError, createGraphClient, GraphError, type GraphErrorKind } from '../../src/whatsapp/graph.ts';

type Reply = { status: number; body?: unknown } | Error;

function client(replies: Reply[], opts: { maxRetries?: number } = {}) {
  const requests: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  const sleeps: number[] = [];
  const fetch = (async (url: URL, init: RequestInit) => {
    requests.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body });
    const next = replies.shift();
    if (!next) throw new Error('no more replies');
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? '' : JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof globalThis.fetch;
  const graph = createGraphClient({
    version: 'v23.0',
    accessToken: 'tok',
    fetch,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
    maxRetries: opts.maxRetries,
  });
  return { graph, requests, sleeps };
}

const metaError = (code: number, status = 400) => ({ status, body: { error: { message: `err ${code}`, code, fbtrace_id: 'trace' } } });

describe('Meta error mapping', () => {
  it.each([
    [190, 401, 'token_invalid'],
    [131047, 400, 'outside_window'],
    [131026, 400, 'undeliverable'],
    [131051, 400, 'undeliverable'],
    [131009, 400, 'bad_params'],
    [100, 400, 'bad_params'],
    [4, 400, 'throttled'],
    [80007, 400, 'throttled'],
    [130429, 400, 'throttled'],
    [131056, 400, 'throttled'],
    [undefined, 429, 'throttled'],
    [131000, 500, 'other'],
  ] as [number | undefined, number, GraphErrorKind][])('code %s (HTTP %s) → %s', (code, status, kind) => {
    expect(classifyMetaError(code, status)).toBe(kind);
  });

  it('summarises without leaking the token', () => {
    const e = new GraphError({ message: 'Invalid OAuth access token', status: 401, code: 190 });
    expect(e.summary()).toBe('token_invalid (190): Invalid OAuth access token');
  });
});

describe('Graph client', () => {
  it('sends messages with bearer auth and returns the wamid', async () => {
    const { graph, requests } = client([{ status: 200, body: { messages: [{ id: 'wamid.1' }] } }]);
    expect(await graph.sendMessage('123', { to: '27820000000', type: 'text', text: { body: 'hi' } })).toEqual({ wamid: 'wamid.1' });
    expect(requests[0]).toMatchObject({ url: 'https://graph.facebook.com/v23.0/123/messages', method: 'POST' });
    expect(requests[0]!.headers.authorization).toBe('Bearer tok');
    expect(JSON.parse(String(requests[0]!.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '27820000000',
      type: 'text',
      text: { body: 'hi' },
    });
  });

  it('retries throttling and 5xx with exponential backoff, then succeeds', async () => {
    const { graph, sleeps, requests } = client([metaError(130429), { status: 503, body: {} }, { status: 200, body: { messages: [{ id: 'w' }] } }]);
    await graph.sendMessage('1', {});
    expect(requests).toHaveLength(3);
    // base 300ms × 2^attempt, plus jitter random()=0.5 of the same.
    expect(sleeps).toEqual([450, 900]);
  });

  it('retries network errors', async () => {
    const { graph, requests } = client([new Error('ECONNRESET'), { status: 200, body: { messages: [{ id: 'w' }] } }]);
    await graph.sendMessage('1', {});
    expect(requests).toHaveLength(2);
  });

  it('gives up after maxRetries with the last error', async () => {
    const { graph, requests } = client([metaError(4), metaError(4), metaError(4)], { maxRetries: 2 });
    await expect(graph.sendMessage('1', {})).rejects.toMatchObject({ kind: 'throttled', code: 4 });
    expect(requests).toHaveLength(3);
  });

  it.each([
    [190, 'token_invalid'],
    [131047, 'outside_window'],
    [131026, 'undeliverable'],
    [131051, 'undeliverable'],
  ] as const)('does not retry code %s (%s)', async (code, kind) => {
    const { graph, requests } = client([metaError(code), { status: 200, body: {} }]);
    await expect(graph.sendMessage('1', {})).rejects.toMatchObject({ kind, code, fbtraceId: 'trace' });
    expect(requests).toHaveLength(1);
  });

  it('fails a network error after retries as kind network', async () => {
    const { graph } = client([new Error('a'), new Error('b')], { maxRetries: 1 });
    await expect(graph.getPhoneNumber('1')).rejects.toMatchObject({ kind: 'network', status: 0 });
  });

  it('treats a send without a message id as an error', async () => {
    const { graph } = client([{ status: 200, body: {} }]);
    await expect(graph.sendMessage('1', {})).rejects.toBeInstanceOf(GraphError);
  });

  it('calls the onboarding endpoints', async () => {
    const { graph, requests } = client([
      { status: 200, body: { success: true } },
      { status: 200, body: { success: true } },
      { status: 200, body: { success: true } },
      { status: 200, body: { id: 'f1', validation_errors: [] } },
      { status: 200, body: { data: [{ id: 't', name: 'n', language: 'en', status: 'APPROVED' }] } },
      { status: 200, body: { access_token: 'biz', expires_in: 100 } },
      { status: 200, body: { data: { is_valid: true, expires_at: 0, scopes: ['whatsapp_business_messaging'] } } },
    ]);
    await graph.subscribeApp('waba');
    await graph.registerNumber('pn', '123456');
    await graph.uploadFlowPublicKey('pn', 'PEM');
    expect(await graph.createFlow('waba', { name: 'b', categories: ['APPOINTMENT_BOOKING'], flowJson: '{}', endpointUri: 'https://x/flows/whatsapp', publish: true })).toEqual({
      id: 'f1',
      validationErrors: [],
    });
    expect(await graph.listTemplates('waba')).toHaveLength(1);
    expect(await graph.exchangeCode({ appId: 'a', appSecret: 's', code: 'c' })).toEqual({ accessToken: 'biz', expiresIn: 100 });
    expect(await graph.debugToken({ appId: 'a', appSecret: 's', inputToken: 't' })).toEqual({ isValid: true, expiresAt: null, scopes: ['whatsapp_business_messaging'] });

    expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /v23.0/waba/subscribed_apps',
      'POST /v23.0/pn/register',
      'POST /v23.0/pn/whatsapp_business_encryption',
      'POST /v23.0/waba/flows',
      'GET /v23.0/waba/message_templates',
      'GET /v23.0/oauth/access_token',
      'GET /v23.0/debug_token',
    ]);
    expect(JSON.parse(String(requests[1]!.body))).toEqual({ messaging_product: 'whatsapp', pin: '123456' });
    expect(String(requests[2]!.body)).toBe('business_public_key=PEM');
    // App-token calls never send the business bearer token.
    expect(requests[5]!.headers.authorization).toBeUndefined();
    expect(new URL(requests[6]!.url).searchParams.get('access_token')).toBe('a|s');
  });
});
