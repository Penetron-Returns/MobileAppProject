import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../src/lib/crypto.ts';
import definitions from '../../src/nerova/booking-connector.mcp-tools.json' with { type: 'json' };
import { CONNECTOR_TOKEN, ENDPOINT, nerovaHarness } from './harness.ts';

const REQUIRED = [
  'accounts_list',
  'accounts_get',
  'services_list',
  'staff_list',
  'availability_search',
  'appointments_get',
  'appointments_list',
  'appointments_create',
  'appointments_reschedule',
  'appointments_cancel',
];

describe('connector auth', () => {
  it.each([
    ['no token', null],
    ['a wrong token', 'not-the-token'],
  ])('answers 401 unauthorized for %s', async (_label, token) => {
    const h = nerovaHarness();
    const res = await h.app.request(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
    expect(await res.json()).toMatchObject({ code: 'unauthorized', status: 401 });
  });

  it('rejects before reading the body, so a bad token never reaches a tool', async () => {
    const h = nerovaHarness();
    const { status } = await h.rpc('tools/call', { name: 'accounts_list', arguments: {} }, { token: 'nope' });
    expect(status).toBe(401);
  });

  it('fails closed when no token hash is configured', async () => {
    const h = nerovaHarness({ env: { NEROVA_CONNECTOR_TOKEN_HASHES: undefined } });
    expect((await h.rpc('tools/list')).status).toBe(401);
    const blank = nerovaHarness({ env: { NEROVA_CONNECTOR_TOKEN_HASHES: ' , not-a-hash' } });
    expect((await blank.rpc('tools/list')).status).toBe(401);
  });

  it('accepts either of two hashes so the secret can be rotated', async () => {
    const next = 'rotated-token-9876543210';
    const h = nerovaHarness({ env: { NEROVA_CONNECTOR_TOKEN_HASHES: `${sha256Hex(CONNECTOR_TOKEN)}, ${sha256Hex(next).toUpperCase()}` } });
    expect((await h.rpc('tools/list', undefined, { token: CONNECTOR_TOKEN })).status).toBe(200);
    expect((await h.rpc('tools/list', undefined, { token: next })).status).toBe(200);
    expect((await h.rpc('tools/list', undefined, { token: 'old-token' })).status).toBe(401);
  });

  it('refuses browser origins and non-POST methods', async () => {
    const h = nerovaHarness();
    const withOrigin = await h.rpc('tools/list', undefined, { headers: { origin: 'https://evil.example' } });
    expect(withOrigin.status).toBe(403);
    const get = await h.app.request(ENDPOINT, { method: 'GET', headers: { authorization: `Bearer ${CONNECTOR_TOKEN}` } });
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
  });
});

describe('MCP handshake', () => {
  it('initializes with the tools capability and echoes a supported protocol version', async () => {
    const h = nerovaHarness();
    const { body } = await h.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nerova', version: '1' } });
    expect(body.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: expect.any(String) } });
    const older = await h.rpc('initialize', { protocolVersion: '1999-01-01' });
    expect(older.body.result.protocolVersion).toBe('2025-06-18');
  });

  it('acknowledges notifications with 202 and no body', async () => {
    const h = nerovaHarness();
    const res = await h.rpc('notifications/initialized', undefined, { id: null });
    expect(res).toEqual({ status: 202, body: null });
  });

  it('answers ping, unknown methods, malformed envelopes and bad JSON', async () => {
    const h = nerovaHarness();
    expect((await h.rpc('ping')).body.result).toEqual({});
    expect((await h.rpc('resources/list')).body.error.code).toBe(-32601);
    const envelope = await h.app.request(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${CONNECTOR_TOKEN}` },
      body: JSON.stringify({ hello: 'world' }),
    });
    expect(((await envelope.json()) as any).error.code).toBe(-32600);
    const broken = await h.app.request(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${CONNECTOR_TOKEN}` }, body: '{nope' });
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as any).error.code).toBe(-32700);
  });
});

describe('tools/list', () => {
  it('publishes exactly the ten required tools with Nerova\'s schemas and annotations', async () => {
    const h = nerovaHarness();
    const { body } = await h.rpc('tools/list');
    const tools = body.result.tools as { name: string; annotations: { readOnlyHint: boolean } }[];
    expect(tools.map((t) => t.name)).toEqual(REQUIRED);
    expect(tools).toEqual(definitions.tools);
    const readOnly = tools.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    expect(readOnly).toEqual(REQUIRED.filter((n) => !/create|reschedule|cancel/.test(n)));
  });

  it('is pinned to the 2026-10-12 contract', () => {
    expect(definitions.contractVersion).toBe('2026-10-12');
  });

  it('requires accountId on every per-account tool', () => {
    for (const tool of definitions.tools) {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      expect(required.includes('accountId'), tool.name).toBe(tool.name !== 'accounts_list');
    }
  });
});

describe('tools/call envelope', () => {
  it('returns structuredContent plus the same JSON as text', async () => {
    const h = nerovaHarness();
    const result = await h.tool('services_list', { accountId: h.business.id });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });

  it('returns failures as isError results with a code and a text item', async () => {
    const h = nerovaHarness();
    const result = await h.tool('accounts_get', { accountId: 'nope' });
    expect(result).toEqual({
      isError: true,
      structuredContent: { code: 'not_found', detail: expect.any(String) },
      content: [{ type: 'text', text: 'not_found' }],
    });
  });

  it('answers an unknown tool with JSON-RPC -32602', async () => {
    const h = nerovaHarness();
    const { body } = await h.rpc('tools/call', { name: 'appointments_delete', arguments: {} });
    expect(body.error.code).toBe(-32602);
  });

  it('turns bad arguments into invalid_request and ignores unknown ones', async () => {
    const h = nerovaHarness();
    const missing = await h.tool('accounts_get', {});
    expect(missing.structuredContent.code).toBe('invalid_request');
    const badType = await h.tool('accounts_list', { limit: 'ten' });
    expect(badType.structuredContent.code).toBe('invalid_request');
    const extra = await h.tool('accounts_get', { accountId: h.business.id, somethingNew: true });
    expect(extra.isError).toBeUndefined();
  });

  it('maps unexpected failures to provider_unavailable without leaking details', async () => {
    const h = nerovaHarness();
    h.repo.getBusiness = async () => {
      throw new Error('connection string postgres://secret');
    };
    const result = await h.tool('accounts_get', { accountId: h.business.id });
    expect(result.structuredContent.code).toBe('provider_unavailable');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});

describe('request size limit', () => {
  const post = (h: ReturnType<typeof nerovaHarness>, body: string, headers: Record<string, string> = {}) =>
    h.app.request(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CONNECTOR_TOKEN}`, ...headers },
      body,
    });

  it('counts bytes, not characters: multi-byte text over the limit is refused', async () => {
    const h = nerovaHarness();
    // 150k characters of 2-byte "é" is 300 KB, but only 150k string units
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: { pad: 'é'.repeat(150_000) } });
    expect(body.length).toBeLessThan(256 * 1024);
    expect((await post(h, body)).status).toBe(413);
  });

  it('refuses on a declared Content-Length before reading the body', async () => {
    const h = nerovaHarness();
    const res = await post(h, '{}', { 'content-length': String(10 * 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'invalid_request', status: 413 });
  });

  it('still accepts a normal message', async () => {
    const h = nerovaHarness();
    expect((await post(h, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).status).toBe(200);
  });
});
