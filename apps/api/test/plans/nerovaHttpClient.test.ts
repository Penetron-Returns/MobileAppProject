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

  it('reads the companion setup next step, WhatsApp status and receptionist state', async () => {
    const f = fakeFetch(() =>
      json(200, {
        nextStep: 'connect_whatsapp',
        receptionistLive: false,
        version: 3,
        whatsApp: { connected: true, state: 'connected', displayPhoneNumber: '+27 82 000 0000', businessVerified: true },
      }),
    );
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getCompanionSetup('acct_1')).toEqual({
      nextStep: 'connect_whatsapp',
      receptionistLive: false,
      version: 3,
      whatsapp: { connected: true, state: 'connected', displayPhoneNumber: '+27 82 000 0000', businessVerified: true, businessVerificationStatus: null },
      provisioned: false,
      bookingConnection: null,
      blockingReasons: [],
    });
    expect(f.calls[0]?.url).toBe('https://api.nerova.si/v1/accounts/acct_1/companion/setup');
  });

  it('defaults a missing whatsApp block to not connected', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(200, { nextStep: 'none' })).impl });
    expect(await client.getCompanionSetup('acct_1')).toEqual({
      nextStep: 'none',
      receptionistLive: false,
      version: null,
      whatsapp: { connected: false, state: 'not_connected', displayPhoneNumber: null, businessVerified: false, businessVerificationStatus: null },
      provisioned: false,
      bookingConnection: null,
      blockingReasons: [],
    });
  });

  it('reads the live setup shape: companionLive, verification status, blocking reasons', async () => {
    const f = fakeFetch(() =>
      json(200, {
        provisioned: true,
        bookingConnection: 'verified',
        whatsApp: { connected: false, state: 'not_connected', businessVerificationStatus: 'pending', businessVerified: false, displayPhoneNumber: null },
        companionLive: true,
        nextStep: 'connect_whatsapp',
        blockingReasons: ['activation.channel_not_ready', 7, ''],
        version: 2,
      }),
    );
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getCompanionSetup('acct_1')).toEqual({
      nextStep: 'connect_whatsapp',
      receptionistLive: true,
      version: 2,
      provisioned: true,
      bookingConnection: 'verified',
      blockingReasons: ['activation.channel_not_ready'],
      whatsapp: { connected: false, state: 'not_connected', displayPhoneNumber: null, businessVerified: false, businessVerificationStatus: 'pending' },
    });
  });

  it('reads the activation version from the setup, and null when it is missing', async () => {
    const f = fakeFetch(() => json(200, { nextStep: 'connect_whatsapp', version: 4 }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getCompanionSetup('acct_1')).toMatchObject({ version: 4 });
    const bad = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(200, { nextStep: 'none' })).impl });
    expect(await bad.getCompanionSetup('acct_1')).toMatchObject({ version: null });
  });

  it('posts a whats_app connection session with the idempotency key and returns the launch url untouched', async () => {
    const launchUrl = 'https://app.nerova.si/connect/whatsapp/pacs_1#state=abc123';
    const f = fakeFetch(() => json(201, { launchUrl, expiresAt: '2026-10-13T10:10:00Z', state: 'abc123', sessionId: 'pacs_1' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    const session = await client.createConnectionSession({
      accountId: 'acct_1',
      embedOrigin: 'https://app.example.test',
      expectedVersion: 4,
      idempotencyKey: 'companion-wa-connect-acct_1-2026-10-13T10:00-v4',
    });
    expect(session).toEqual({ launchUrl, expiresAt: '2026-10-13T10:10:00Z' });
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.nerova.si/v1/accounts/acct_1/connection-sessions');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('companion-wa-connect-acct_1-2026-10-13T10:00-v4');
    expect(headers.Authorization).toBe(`Bearer ${NEROVA_KEY}`);
    expect(JSON.parse(call.init.body as string)).toEqual({ channel: 'whats_app', embedOrigin: 'https://app.example.test', expectedVersion: 4 });
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
      layout: 'fill',
      avatar: 'hidden',
    });
  });

  it('maps a 400 widget.presentation_invalid to UPSTREAM_COMPANION_ERROR carrying the Nerova code', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(400, { code: 'widget.presentation_invalid' })).impl });
    await expect(
      client.createOwnerChatSession({ accountId: 'acct_1', origin: 'https://x.test', ownerReference: 'u', colorMode: 'light', idempotencyKey: 'abcdefgh' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', status: 502, details: { status: 400, nerova_code: 'widget.presentation_invalid' } });
  });

  it('posts a native session with platform and appId, no origin, layout or avatar, and maps sessionId and state', async () => {
    const f = fakeFetch(() => json(200, { sessionId: 'wsn_1', url: 'https://chat.example/n/abc', expiresAt: '2026-10-13T10:15:00Z', state: 'st_secret' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    const session = await client.createOwnerChatSession({
      accountId: 'acct_1',
      native: { appId: 'si.nerova.booking.dev' },
      ownerReference: 'user_1',
      colorMode: 'light',
      idempotencyKey: 'companion-session-acct_1-user_1-2026-10-13T10:00-light-native',
    });
    expect(session).toEqual({ url: 'https://chat.example/n/abc', expiresAt: '2026-10-13T10:15:00Z', sessionId: 'wsn_1', state: 'st_secret' });
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({
      widget: 'owner_chat',
      ownerReference: 'user_1',
      theme: { colorMode: 'light' },
      platform: 'native',
      appId: 'si.nerova.booking.dev',
    });
  });

  it('does not surface sessionId or state for a web session', async () => {
    const f = fakeFetch(() => json(200, { sessionId: 'wsn_1', url: 'https://chat.example/s/abc', expiresAt: '2026-10-13T10:15:00Z', state: 'x' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    const session = await client.createOwnerChatSession({ accountId: 'a', origin: 'https://x.test', ownerReference: 'u', colorMode: 'light', idempotencyKey: 'abcdefgh' });
    expect(session).toEqual({ url: 'https://chat.example/s/abc', expiresAt: '2026-10-13T10:15:00Z' });
  });

  it('sends returnUrl on the connection session only when given', async () => {
    const f = fakeFetch(() => json(201, { launchUrl: 'https://app.nerova.si/c#state=a', expiresAt: '2026-10-13T10:10:00Z' }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    const base = { accountId: 'acct_1', embedOrigin: 'https://x.test', expectedVersion: 1, idempotencyKey: 'abcdefgh' };
    await client.createConnectionSession({ ...base, returnUrl: 'bookingadmin://companion/whatsapp-return', appId: 'si.nerova.booking.dev' });
    await client.createConnectionSession(base);
    expect(JSON.parse(f.calls[0]!.init.body as string)).toMatchObject({ returnUrl: 'bookingadmin://companion/whatsapp-return', appId: 'si.nerova.booking.dev' });
    expect(JSON.parse(f.calls[1]!.init.body as string)).not.toHaveProperty('returnUrl');
    expect(JSON.parse(f.calls[1]!.init.body as string)).not.toHaveProperty('appId');
  });

  it.each([
    [400, 'return_url_not_allowed', 'return_url_not_allowed'],
    [422, 'activation.return_url_not_allowed', 'return_url_not_allowed'],
    [400, 'activation.app_not_registered', 'app_not_registered'],
    [422, 'activation.app_not_registered', 'app_not_registered'],
  ])('maps a connection session %i %s to UPSTREAM_COMPANION_ERROR reason %s', async (status, code, reason) => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(status, { code })).impl });
    await expect(
      client.createConnectionSession({ accountId: 'a', embedOrigin: 'https://x.test', expectedVersion: 1, idempotencyKey: 'abcdefgh', returnUrl: 'bookingadmin://companion/whatsapp-return' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', status: 502, details: { status, nerova_code: code, reason } });
  });

  it('maps a 422 widget.origin_unexpected on a native session to reason origin_unexpected', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(422, { code: 'widget.origin_unexpected' })).impl });
    await expect(
      client.createOwnerChatSession({ accountId: 'a', native: { appId: 'si.nerova.booking.dev' }, ownerReference: 'u', colorMode: 'light', idempotencyKey: 'abcdefgh' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', details: { status: 422, reason: 'origin_unexpected' } });
  });

  it('asks for the outcome summary of a UTC month', async () => {
    const f = fakeFetch(() => json(200, { 'booking.created': { total: 7, byActor: { customerAgent: 5, ownerCompanion: 2, flow: 0 } } }));
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl });
    expect(await client.getOutcomeSummary('acct_1', { year: 2026, month: 10 })).toMatchObject({ bookings_created: 7 });
    expect(f.calls[0]?.url).toBe('https://api.nerova.si/v1/accounts/acct_1/outcomes/summary?year=2026&month=10');
  });

  it.each([400, 401, 403, 422, 500])('maps an undocumented %i to UPSTREAM_COMPANION_ERROR without echoing the key', async (status) => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(status, { code: 'widget.something_new', detail: `key ${NEROVA_KEY}` })).impl });
    const error = await client
      .createOwnerChatSession({ accountId: 'acct_1', origin: 'https://x.test', ownerReference: 'u', colorMode: 'light', idempotencyKey: 'abcdefgh' })
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', status: 502, details: { status, nerova_code: 'widget.something_new' } });
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

describe('connection session errors', () => {
  const input = { accountId: 'a', embedOrigin: 'https://x.test', expectedVersion: 1, idempotencyKey: 'abcdefgh' };
  const withStatus = (status: number, code: string | null) => createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(status, code ? { code } : {})).impl });

  it.each([
    [409, 'activation.not_provisioned', 'not_provisioned'],
    [403, 'auth.account_not_available', 'account_not_available'],
  ])('maps %s %s to COMPANION_NOT_READY / %s', async (status, code, reason) => {
    await expect(withStatus(status, code).createConnectionSession(input)).rejects.toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason } });
  });

  it('surfaces a stale version (409 activation.version_conflict) as UPSTREAM_COMPANION_ERROR carrying the nerova code, not as not-ready', async () => {
    await expect(withStatus(409, 'activation.version_conflict').createConnectionSession(input)).rejects.toMatchObject({
      code: 'UPSTREAM_COMPANION_ERROR',
      details: { status: 409, nerova_code: 'activation.version_conflict' },
    });
  });

  it('rejects a response without a launch url', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(201, { expiresAt: '2026-10-13T10:10:00Z' })).impl });
    await expect(client.createConnectionSession(input)).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR' });
  });
});

describe('not-ready mapping', () => {
  const session = { accountId: 'a', origin: 'https://x.test', ownerReference: 'u', colorMode: 'light' as const, idempotencyKey: 'abcdefgh' };
  const withStatus = (status: number, code: string | null, logger?: { warn: (m: string, d?: unknown) => void }) =>
    createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => json(status, code ? { code } : {})).impl, ...(logger ? { logger: logger as never } : {}) });

  it('maps a 403 auth.account_not_available on lookup and setup to account_not_available without the key', async () => {
    const client = withStatus(403, 'auth.account_not_available');
    for (const call of [client.getAccount('x'), client.getCompanionSetup('x')]) {
      const error = await call.catch((e: unknown) => e);
      expect(error).toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason: 'account_not_available' } });
      expect(JSON.stringify(error)).not.toContain(NEROVA_KEY);
    }
  });

  it.each([
    [403, 'auth.something_else'],
    [500, null],
    [401, 'auth.invalid_key'],
  ])('keeps %s %s on the account lookup as UPSTREAM_COMPANION_ERROR', async (status, code) => {
    await expect(withStatus(status, code).getAccount('x')).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR' });
  });

  it.each([
    [422, 'widget.origins_not_registered', 'origin_not_registered'],
    [422, 'widget.origin_not_registered', 'origin_not_registered'],
    [403, 'widget.authorization_invalid', 'key_not_authorized'],
    [403, 'auth.account_not_available', 'account_not_available'],
  ])('maps session %s %s to COMPANION_NOT_READY / %s', async (status, code, reason) => {
    await expect(withStatus(status, code).createOwnerChatSession(session)).rejects.toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason } });
  });

  it('logs the configured origin when it is not registered', async () => {
    const warnings: unknown[][] = [];
    const client = withStatus(422, 'widget.origins_not_registered', { warn: (...args) => void warnings.push(args) });
    await client.createOwnerChatSession(session).catch(() => undefined);
    expect(warnings).toEqual([['companion_origin_not_registered', { origin: 'https://x.test' }]]);
  });

  it.each([
    [500, null],
    [422, 'validation.failed'],
    [400, 'widget.other'],
  ])('keeps session %s %s as UPSTREAM_COMPANION_ERROR', async (status, code) => {
    await expect(withStatus(status, code).createOwnerChatSession(session)).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR' });
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
