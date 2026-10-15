import { describe, expect, it } from 'vitest';

import { createHttpNerovaClient, createNerovaClientFromEnv } from '@booking/companion/nerova/httpClient.ts';
import { parseOutcomeSummary } from '@booking/companion/nerova/outcomes.ts';
import { NEROVA_KEY } from './harness.ts';

interface Seen {
  url: string;
  init: RequestInit;
}

function fakeFetch(responder: (seen: Seen) => Response | Promise<Response>) {
  const calls: Seen[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const seen = { url: String(url), init: init ?? {} };
    calls.push(seen);
    return responder(seen);
  }) as typeof fetch;
  return { calls, impl };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createHttpNerovaClient', () => {
  it('sends the bearer key to the account endpoint and maps the account', async () => {
    const f = fakeFetch(() => json(200, { id: 'acct_1', provisioningState: 'ready', other: 'ignored' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getAccount('10000000-0000-4000-8000-000000000002')).toEqual({ id: 'acct_1', provisioningState: 'ready' });
    expect(f.calls[0]?.url).toBe('https://api.nerova.si/v1/accounts/10000000-0000-4000-8000-000000000002');
    expect((f.calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${NEROVA_KEY}`);
  });

  it('answers null for an unknown account (404) on lookups', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(404, { code: 'account.not_found' })).impl });
    expect(await client.getAccount('nope')).toBeNull();
    expect(await client.getCompanionSetup('nope')).toBeNull();
  });

  it('reads the companion setup next step', async () => {
    const f = fakeFetch(() => json(200, { nextStep: 'connect_whatsapp' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getCompanionSetup('acct_1')).toEqual({ nextStep: 'connect_whatsapp' });
    expect(f.calls[0]?.url).toBe('https://api.nerova.si/v1/accounts/acct_1/companion/setup');
  });

  it('posts an owner_chat session with the idempotency key and the documented body', async () => {
    const f = fakeFetch(() => json(200, { url: 'https://chat.example/s/abc', expiresAt: '2026-10-13T10:15:00Z' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    const session = await client.createOwnerChatSession({
      accountId: 'acct_1',
      origin: 'https://app.example.test',
      ownerReference: 'user_1',
      colorMode: 'dark',
      idempotencyKey: 'companion-session-acct_1-user_1-2026-10-13T10:00-dark',
    });
    expect(session).toEqual({ url: 'https://chat.example/s/abc', expiresAt: '2026-10-13T10:15:00Z' });
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.nerova.si/v1/accounts/acct_1/widgets/sessions');
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>)['Idempotency-Key']).toBe('companion-session-acct_1-user_1-2026-10-13T10:00-dark');
    expect(JSON.parse(call.init.body as string)).toEqual({
      widget: 'owner_chat',
      origin: 'https://app.example.test',
      ownerReference: 'user_1',
      theme: { colorMode: 'dark' },
    });
  });

  it('asks for the outcome summary of a UTC month', async () => {
    const f = fakeFetch(() => json(200, { 'booking.created': { total: 7, byActor: { customerAgent: 5, ownerCompanion: 2, flow: 0 } } }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getOutcomeSummary('acct_1', { year: 2026, month: 10 })).toMatchObject({ bookings_created: 7 });
    expect(f.calls[0]?.url).toBe('https://api.nerova.si/v1/accounts/acct_1/outcomes/summary?year=2026&month=10');
  });

  it.each([401, 403, 422, 500])('maps a %i to UPSTREAM_COMPANION_ERROR without echoing the key', async (status) => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(status, { code: 'widget.origin_not_registered', detail: `key ${NEROVA_KEY}` })).impl });
    const error = await client
      .createOwnerChatSession({ accountId: 'acct_1', origin: 'https://x.test', ownerReference: 'u', colorMode: 'light', idempotencyKey: 'abcdefgh' })
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', status: 502, details: { status, nerova_code: 'widget.origin_not_registered' } });
    expect(JSON.stringify(error.details) + error.message).not.toContain(NEROVA_KEY);
  });

  it('maps a network failure and a timeout to UPSTREAM_COMPANION_ERROR', async () => {
    const down = createHttpNerovaClient({
      apiKey: NEROVA_KEY,
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(down.getAccount('x')).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', details: { reason: 'network' } });

    const slow = createHttpNerovaClient({
      apiKey: NEROVA_KEY,
      timeoutMs: 5,
      fetch: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))) as unknown as typeof fetch,
    });
    await expect(slow.getAccount('x')).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', details: { reason: 'timeout' } });
  });

  it('rejects a session response without a url', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(200, {})).impl });
    await expect(
      client.createOwnerChatSession({ accountId: 'a', origin: 'https://x.test', ownerReference: 'u', colorMode: 'light', idempotencyKey: 'abcdefgh' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR' });
  });
});

describe('createNerovaClientFromEnv', () => {
  it('without a key every call is COMPANION_NOT_READY / unavailable and nothing is sent', async () => {
    const client = createNerovaClientFromEnv({});
    await expect(client.getAccount('x')).rejects.toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason: 'unavailable' } });
    await expect(client.getOutcomeSummary('x', { year: 2026, month: 10 })).rejects.toMatchObject({ code: 'COMPANION_NOT_READY' });
  });
});

describe('parseOutcomeSummary', () => {
  it('accepts counts at the top level, under outcomes, as numbers or objects', () => {
    expect(parseOutcomeSummary({ 'booking.created': 4, 'booking.rescheduled': { count: 2 }, outcomes: { 'booking.cancelled': { total: 1 } } })).toEqual({
      bookings_created: 4,
      bookings_rescheduled: 2,
      bookings_cancelled: 1,
      conversations_handled: 0,
    });
  });

  it('sums the byActor split when there is no total', () => {
    expect(parseOutcomeSummary({ counts: { 'conversation.handled': { byActor: { customerAgent: 10, ownerCompanion: 3, flow: 2 } } } }).conversations_handled).toBe(15);
  });

  it('defaults anything missing or malformed to 0', () => {
    expect(parseOutcomeSummary({ 'booking.created': 'many', 'booking.cancelled': -2 })).toEqual({
      bookings_created: 0,
      bookings_rescheduled: 0,
      bookings_cancelled: 0,
      conversations_handled: 0,
    });
  });
});
