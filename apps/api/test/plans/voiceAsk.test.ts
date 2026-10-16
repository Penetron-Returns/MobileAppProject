import { describe, expect, it, vi } from 'vitest';

import type { ApprovalDecision, CompanionChatClient, CompanionChatSession } from '@booking/companion/nerova/chatClient.ts';
import { parseChatStream, type ChatTurn } from '@booking/companion/nerova/chatStream.ts';
import type { CompanionService } from '@booking/companion/nerova/companionService.ts';
import { createHttpCompanionChatClient } from '@booking/companion/nerova/httpChatClient.ts';
import { createVoiceAskService, SESSION_MARGIN_MS, type VoiceAskService } from '@booking/companion/nerova/voiceAsk.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { createDeviceTokenService } from '@booking/features/voice/deviceTokens.ts';
import { createMemoryDeviceTokenRepository } from '@booking/testing/voiceTokens.ts';
import { isDeviceTokenRoute } from '../../src/middleware/deviceToken.ts';
import { BIZ, ORG, OWNER_ID, plansHarness } from './harness.ts';

const sse = (...frames: [string, unknown][]) => frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

const approvalFrame = (id: string, title: string): [string, unknown] => [
  'approval',
  { id, kind: 'create_appointment', title, lines: [{ label: 'When', from: null, to: 'Fri 16 Oct, 20:30' }], consequences: ['Books it'], expiresAt: '2026-10-16T10:30:00Z' },
];

describe('parseChatStream', () => {
  it('joins the text deltas and reads done suggestions', () => {
    const turn = parseChatStream(
      sse(['tool', { name: 'x', label: 'Checking', status: 'start' }], ['text-delta', { delta: 'You have ' }], ['text-delta', { delta: 'two bookings.' }], ['done', { suggestions: ['Show today'] }]),
    );
    expect(turn).toMatchObject({ reply: 'You have two bookings.', suggestions: ['Show today'], isDone: true, error: null, approvals: [] });
  });

  it('collects every approval in order', () => {
    const turn = parseChatStream(sse(approvalFrame('oapr_1', 'Book A?'), approvalFrame('oapr_2', 'Book B?'), ['done', { suggestions: [] }]));
    expect(turn.approvals.map((a) => a.id)).toEqual(['oapr_1', 'oapr_2']);
    expect(turn.approvals[0]!.lines).toEqual([{ label: 'When', from: null, to: 'Fri 16 Oct, 20:30' }]);
  });

  it('reports an error event', () => {
    const turn = parseChatStream(sse(['text-delta', { delta: 'Hmm' }], ['error', { code: 'companion.turn_failed', message: 'x', retryable: true }]));
    expect(turn.error).toEqual({ code: 'companion.turn_failed', message: 'x', retryable: true });
    expect(turn.isDone).toBe(false);
  });

  it('handles CRLF, comments and malformed frames', () => {
    const body = ': keepalive\r\n\r\nevent: text-delta\r\ndata: {"delta":"Hi"}\r\n\r\nevent: text-delta\r\ndata: {broken\r\n\r\nevent: done\r\ndata: {"suggestions":[]}\r\n\r\n';
    expect(parseChatStream(body)).toMatchObject({ reply: 'Hi', isDone: true });
  });

  it('is empty for an empty body', () => {
    expect(parseChatStream('')).toMatchObject({ reply: '', approvals: [], isDone: false });
  });
});

describe('createHttpCompanionChatClient', () => {
  const session: CompanionChatSession = { sessionId: 'wsn_1', state: 'state-secret' };
  const streamResponse = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

  it('sends the session headers and the message, and parses the stream', async () => {
    const fetchFn = vi.fn(async () => streamResponse(sse(['text-delta', { delta: 'Hello' }], ['done', { suggestions: [] }])));
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    const turn = await client.chat(session, 'hi');
    expect(turn.reply).toBe('Hello');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.nerova.si/v1/companion/chat');
    expect(init.headers).toMatchObject({ 'X-Widget-Session-Id': 'wsn_1', 'X-Widget-State': 'state-secret' });
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi' });
  });

  it('maps an in-stream error to UPSTREAM_COMPANION_ERROR with the nerova code', async () => {
    const fetchFn = async () => streamResponse(sse(['error', { code: 'companion.turn_failed', message: 'x', retryable: true }]));
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    await expect(client.chat(session, 'hi')).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', details: { nerova_code: 'companion.turn_failed', retryable: true } });
  });

  it.each([
    [401, 'companion.session_expired', 'UPSTREAM_COMPANION_ERROR'],
    [409, 'companion.account_not_ready', 'COMPANION_NOT_READY'],
    [503, 'companion.connector_unavailable', 'UPSTREAM_COMPANION_ERROR'],
    [429, 'request.rate_limited', 'RATE_LIMITED'],
    [400, 'request.invalid', 'VALIDATION_FAILED'],
  ])('maps problem %s %s to %s', async (status, code, expected) => {
    const fetchFn = async () => new Response(JSON.stringify({ code }), { status, headers: { 'retry-after': '3' } });
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    await expect(client.chat(session, 'hi')).rejects.toMatchObject({ code: expected });
  });

  it('approves exactly the given id with an idempotency key', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ approval: { kind: 'create_appointment' } }), { status: 200 }));
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    const out = await client.decide(session, 'oapr_2', 'approve', 'key-12345678');
    expect(out.kind).toBe('create_appointment');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.nerova.si/v1/companion/approvals/oapr_2/approve');
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'key-12345678' });
  });

  it.each([
    [404, 'approval.not_found', 'NOT_FOUND'],
    [410, 'approval.expired', 'WINDOW_CLOSED'],
    [409, 'approval.already_decided', 'RULE_VIOLATION'],
    [409, 'approval.connector_conflict', 'RULE_VIOLATION'],
    [503, 'approval.connector_unavailable', 'UPSTREAM_COMPANION_ERROR'],
  ])('maps approval problem %s %s to %s', async (status, code, expected) => {
    const fetchFn = async () => new Response(JSON.stringify({ code }), { status });
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    await expect(client.decide(session, 'oapr_1', 'decline', 'key-12345678')).rejects.toMatchObject({ code: expected });
  });
});

// ---- the service: session caching and retry on expiry ----

const caller = { businessId: BIZ, userId: OWNER_ID };

function serviceHarness(chatImpl?: (session: CompanionChatSession, message: string) => Promise<ChatTurn>) {
  let now = new Date('2026-10-16T10:00:00Z').getTime();
  let minted = 0;
  const companion = {
    createSession: vi.fn(async () => {
      minted += 1;
      return { url: 'u', expires_at: new Date(now + 15 * 60_000).toISOString(), session_id: `wsn_${minted}`, state: `state_${minted}` };
    }),
  } as unknown as CompanionService;
  const emptyTurn: ChatTurn = { reply: 'ok', approvals: [], suggestions: [], error: null, isDone: true };
  const calls: { sessionId: string }[] = [];
  const decisions: { id: string; decision: ApprovalDecision; key: string }[] = [];
  const chat: CompanionChatClient = {
    chat: async (s, m) => {
      calls.push({ sessionId: s.sessionId });
      return chatImpl ? chatImpl(s, m) : emptyTurn;
    },
    decide: async (_s, id, decision, key) => {
      decisions.push({ id, decision, key });
      return { kind: null };
    },
  };
  const service = createVoiceAskService({ companion, chat, clock: () => new Date(now) });
  return { service, companion, calls, decisions, advance: (ms: number) => (now += ms), minted: () => minted };
}

const expired = () => new AppError('UPSTREAM_COMPANION_ERROR', 'x', { status: 401, nerova_code: 'companion.session_expired' });

describe('voice ask service', () => {
  it('mints one session and reuses it across calls', async () => {
    const h = serviceHarness();
    await h.service.ask(caller, 'one');
    await h.service.ask(caller, 'two');
    expect(h.minted()).toBe(1);
    expect(h.calls.map((c) => c.sessionId)).toEqual(['wsn_1', 'wsn_1']);
  });

  it('mints a new session once its lifetime minus the margin has passed', async () => {
    const h = serviceHarness();
    await h.service.ask(caller, 'one');
    h.advance(15 * 60_000 - SESSION_MARGIN_MS + 1);
    await h.service.ask(caller, 'two');
    expect(h.minted()).toBe(2);
  });

  it('caches per user: another user mints their own', async () => {
    const h = serviceHarness();
    await h.service.ask(caller, 'one');
    await h.service.ask({ businessId: BIZ, userId: 'user_other' }, 'two');
    expect(h.minted()).toBe(2);
  });

  it('retries once with a new session on companion.session_expired', async () => {
    let first = true;
    const h = serviceHarness(async () => {
      if (first) {
        first = false;
        throw expired();
      }
      return { reply: 'second try', approvals: [], suggestions: [], error: null, isDone: true };
    });
    const out = await h.service.ask(caller, 'hi');
    expect(out.reply).toBe('second try');
    expect(h.calls.map((c) => c.sessionId)).toEqual(['wsn_1', 'wsn_2']);
  });

  it('does not retry twice', async () => {
    const h = serviceHarness(async () => {
      throw expired();
    });
    await expect(h.service.ask(caller, 'hi')).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR' });
    expect(h.calls).toHaveLength(2);
  });

  it('does not retry other errors', async () => {
    const h = serviceHarness(async () => {
      throw new AppError('RATE_LIMITED', 'slow down');
    });
    await expect(h.service.ask(caller, 'hi')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(h.calls).toHaveLength(1);
  });

  it('is COMPANION_NOT_READY when no native session comes back', async () => {
    const h = serviceHarness();
    (h.companion.createSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ url: 'u', expires_at: new Date().toISOString() });
    await expect(h.service.ask(caller, 'hi')).rejects.toMatchObject({ code: 'COMPANION_NOT_READY' });
  });

  it('returns the reply, approvals (no secrets) and suggestions', async () => {
    const h = serviceHarness(async () =>
      parseChatStream(sse(['text-delta', { delta: 'Shall I?' }], approvalFrame('oapr_1', 'Book A?'), ['done', { suggestions: ['No'] }])),
    );
    const out = await h.service.ask(caller, 'book');
    expect(out).toEqual({
      reply: 'Shall I?',
      approvals: [{ id: 'oapr_1', kind: 'create_appointment', title: 'Book A?', lines: [{ label: 'When', from: null, to: 'Fri 16 Oct, 20:30' }] }],
      suggestions: ['No'],
    });
  });

  it('decides exactly the approval id it is given, with the key', async () => {
    const h = serviceHarness();
    const a = await h.service.decide(caller, 'oapr_2', 'approve', 'idem-key-0001');
    const b = await h.service.decide(caller, 'oapr_1', 'decline', 'idem-key-0002');
    expect(h.decisions).toEqual([
      { id: 'oapr_2', decision: 'approve', key: 'idem-key-0001' },
      { id: 'oapr_1', decision: 'decline', key: 'idem-key-0002' },
    ]);
    expect(a).toMatchObject({ id: 'oapr_2', decision: 'approved' });
    expect(b).toMatchObject({ id: 'oapr_1', decision: 'declined' });
  });
});

// ---- routes and device-token scope ----

function fakeVoiceAsk() {
  const asked: string[] = [];
  const decided: { id: string; decision: string; key: string }[] = [];
  const service: VoiceAskService = {
    ask: async (_c, text) => {
      asked.push(text);
      return { reply: 'Sure.', approvals: [], suggestions: [] };
    },
    decide: async (_c, id, decision, key) => {
      decided.push({ id, decision, key });
      return { id, decision: decision === 'approve' ? 'approved' : 'declined', kind: null };
    },
  };
  return { service, asked, decided };
}

function routeSetup() {
  const repo = createMemoryDeviceTokenRepository();
  repo.addMember({ businessId: BIZ, userId: OWNER_ID, orgId: ORG, role: 'owner' });
  const voiceTokens = createDeviceTokenService({ repo });
  const fake = fakeVoiceAsk();
  const h = plansHarness({ overrides: { voiceTokens, voiceAsk: fake.service } });
  return { h, fake, voiceTokens };
}

describe('POST /v1/voice/ask', () => {
  it('returns { data } for an owner', async () => {
    const { h, fake } = routeSetup();
    const res = await h.call('POST', '/v1/voice/ask', { body: { text: 'how is today' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { reply: 'Sure.', approvals: [], suggestions: [] } });
    expect(fake.asked).toEqual(['how is today']);
  });

  it.each([{}, { text: '' }, { text: '   ' }, { text: 'x'.repeat(4001) }, { text: 5 }])('rejects invalid body %j', async (body) => {
    const { h, fake } = routeSetup();
    const res = await h.call('POST', '/v1/voice/ask', { body });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(fake.asked).toEqual([]);
  });

  it('accepts exactly 4000 characters', async () => {
    const { h } = routeSetup();
    expect((await h.call('POST', '/v1/voice/ask', { body: { text: 'x'.repeat(4000) } })).status).toBe(200);
  });

  it('requires an Idempotency-Key', async () => {
    const { h } = routeSetup();
    const res = await h.app.request('/v1/voice/ask', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hi' }),
    });
    expect(res.status).toBe(400);
  });

  it('gates on the companion feature (Free plan: 403)', async () => {
    const fake = fakeVoiceAsk();
    const h = plansHarness({ plan: 'free', overrides: { voiceAsk: fake.service } });
    const res = await h.call('POST', '/v1/voice/ask', { body: { text: 'hi' } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FEATURE_NOT_IN_PLAN');
  });

  it('rejects a missing token with 401', async () => {
    const { h } = routeSetup();
    const res = await h.app.request('/v1/voice/ask', { method: 'POST', headers: { 'idempotency-key': 'voice-ask-key-1', 'content-type': 'application/json' }, body: '{"text":"hi"}' });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/voice/approvals/:id/(approve|decline)', () => {
  it('passes the exact id and the Idempotency-Key through', async () => {
    const { h, fake } = routeSetup();
    const a = await h.call('POST', '/v1/voice/approvals/oapr_2/approve', { key: 'approve-key-0001' });
    const d = await h.call('POST', '/v1/voice/approvals/oapr_1/decline', { key: 'decline-key-0001' });
    expect(a.body).toEqual({ data: { id: 'oapr_2', decision: 'approved', kind: null } });
    expect(d.body.data).toMatchObject({ id: 'oapr_1', decision: 'declined' });
    expect(fake.decided).toEqual([
      { id: 'oapr_2', decision: 'approve', key: 'approve-key-0001' },
      { id: 'oapr_1', decision: 'decline', key: 'decline-key-0001' },
    ]);
  });

  it('rejects an id with odd characters', async () => {
    const { h, fake } = routeSetup();
    const res = await h.call('POST', '/v1/voice/approvals/bad%20id/approve');
    expect(res.status).toBe(400);
    expect(fake.decided).toEqual([]);
  });
});

describe('device voice token scope for the ask routes', () => {
  it.each([
    ['POST', '/v1/voice/ask', true],
    ['POST', '/api/v1/voice/ask', true],
    ['POST', '/v1/voice/approvals/oapr_1/approve', true],
    ['POST', '/v1/voice/approvals/oapr_1/decline', true],
    ['GET', '/v1/voice/ask', false],
    ['POST', '/v1/voice/approvals/oapr_1/other', false],
    ['POST', '/v1/voice/approvals/approve', false],
    ['POST', '/v1/voice/approvals/a/b/approve', false],
  ])('%s %s -> %s', (method, path, allowed) => {
    expect(isDeviceTokenRoute(method, path)).toBe(allowed);
  });

  it('a device token can ask and decide, and the Clerk-only device-token route still refuses it', async () => {
    const { h, voiceTokens } = routeSetup();
    const token = await voiceTokens.mint({ businessId: BIZ, userId: OWNER_ID });
    const call = (path: string) =>
      h.app.request(path, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'idempotency-key': `device-key-${path.length}-0001`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi' }),
      });
    expect((await call('/v1/voice/ask')).status).toBe(200);
    expect((await call('/v1/voice/approvals/oapr_1/approve')).status).toBe(200);
    expect((await call('/v1/voice/device-token')).status).toBe(401);
  });
});
