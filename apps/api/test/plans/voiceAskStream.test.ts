import { describe, expect, it, vi } from 'vitest';

import type { CompanionChatClient, CompanionChatSession } from '@booking/companion/nerova/chatClient.ts';
import { createSseDecoder, toChatStreamEvent, type ChatStreamEvent } from '@booking/companion/nerova/chatStream.ts';
import type { CompanionService } from '@booking/companion/nerova/companionService.ts';
import { createHttpCompanionChatClient } from '@booking/companion/nerova/httpChatClient.ts';
import { createVoiceAskService, type VoiceAskService, type VoiceStreamItem } from '@booking/companion/nerova/voiceAsk.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { createDeviceTokenService } from '@booking/features/voice/deviceTokens.ts';
import { createMemoryDeviceTokenRepository } from '@booking/testing/voiceTokens.ts';
import { BIZ, ORG, OWNER_ID, plansHarness } from './harness.ts';

const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const session: CompanionChatSession = { sessionId: 'wsn_1', state: 'state-secret' };
const caller = { businessId: BIZ, userId: OWNER_ID };

/** A response whose body arrives in the given chunks, one per read. */
function chunked(chunks: string[], headers: Record<string, string> = {}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(enc.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
}

describe('createSseDecoder', () => {
  it('holds a frame until its blank line arrives, across any chunk boundary', () => {
    const body = frame('text-delta', { delta: 'Hi ' }) + frame('done', { suggestions: [] });
    for (let cut = 1; cut < body.length; cut++) {
      const decoder = createSseDecoder();
      const frames = [...decoder.push(body.slice(0, cut)), ...decoder.push(body.slice(cut)), ...decoder.flush()];
      expect(frames.map((f) => f.event)).toEqual(['text-delta', 'done']);
    }
  });

  it('handles CRLF split between chunks and ignores comments', () => {
    const decoder = createSseDecoder();
    const a = decoder.push(': ping\r\n\r\nevent: text-delta\r\ndata: {"delta":"x"}\r');
    const b = decoder.push('\n\r\n');
    expect([...a, ...b]).toEqual([{ event: 'text-delta', data: '{"delta":"x"}' }]);
  });
});

describe('toChatStreamEvent', () => {
  it('maps done timing and drops unknown or malformed frames', () => {
    const timing = { ttftMs: 410.4, llmMs: 800, toolsMs: 0, totalMs: 900, junk: 1 };
    expect(toChatStreamEvent({ event: 'done', data: JSON.stringify({ suggestions: ['a'], awaitingReply: true, timing }) })).toEqual({
      type: 'done',
      suggestions: ['a'],
      awaitingReply: true,
      timing: { ttftMs: 410, llmMs: 800, toolsMs: 0, totalMs: 900 },
    });
    expect(toChatStreamEvent({ event: 'done', data: '{"suggestions":[],"timing":{"ttftMs":"x"}}' })).toEqual({ type: 'done', suggestions: [] });
    expect(toChatStreamEvent({ event: 'tool', data: '{}' })).toBeNull();
    expect(toChatStreamEvent({ event: 'text-delta', data: '{broken' })).toBeNull();
  });
});

describe('streamChat (http client)', () => {
  it('yields text deltas as chunks arrive, sends mode voice and reads Server-Timing pre', async () => {
    const first = frame('text-delta', { delta: 'Two ' });
    const fetchFn = vi.fn(async () =>
      chunked([first.slice(0, 20), first.slice(20) + frame('text-delta', { delta: 'bookings.' }), frame('done', { suggestions: [] })], { 'server-timing': 'pre;dur=123.4' }),
    );
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    const handle = await client.streamChat(session, 'hi', { mode: 'voice' });
    expect(handle.preMs).toBe(123);
    const events = await collect(handle.events);
    expect(events.map((e) => e.type)).toEqual(['text-delta', 'text-delta', 'done']);
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi', mode: 'voice' });
  });

  it('does not send mode when voice mode is off', async () => {
    const fetchFn = vi.fn(async () => chunked([frame('done', { suggestions: [] })]));
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch, voiceMode: false });
    await client.streamChat(session, 'hi', { mode: 'voice' });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ message: 'hi' });
  });

  it('retries once without mode on a 400 and remembers it (Nerova before PR 1002)', async () => {
    const bodies: unknown[] = [];
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { mode?: string };
      bodies.push(body);
      return body.mode ? new Response(JSON.stringify({ code: 'request.invalid' }), { status: 400 }) : chunked([frame('done', { suggestions: [] })]);
    });
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    await collect((await client.streamChat(session, 'hi', { mode: 'voice' })).events);
    await collect((await client.streamChat(session, 'again', { mode: 'voice' })).events);
    expect(bodies).toEqual([{ message: 'hi', mode: 'voice' }, { message: 'hi' }, { message: 'again' }]);
  });

  it('does not retry a 400 when mode was not sent, and maps other failures as chat does', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ code: 'request.invalid' }), { status: 400 }));
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch, voiceMode: false });
    await expect(client.streamChat(session, 'hi', { mode: 'voice' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const limited = createHttpCompanionChatClient({ fetch: (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch });
    await expect(limited.streamChat(session, 'hi', { mode: 'voice' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('passes the abort signal to the upstream request', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      controller.abort();
      expect(init.signal?.aborted).toBe(true);
      return chunked([]);
    });
    const client = createHttpCompanionChatClient({ fetch: fetchFn as unknown as typeof fetch });
    await client.streamChat(session, 'hi', { mode: 'voice', signal: controller.signal });
    expect(fetchFn).toHaveBeenCalled();
  });
});

function serviceWith(streamChat: CompanionChatClient['streamChat']): VoiceAskService {
  const companion = { createSession: async () => ({ url: 'u', expires_at: new Date(Date.now() + 900_000).toISOString(), session_id: 'wsn_1', state: 's' }) } as unknown as CompanionService;
  const chat: CompanionChatClient = {
    chat: async () => {
      throw new Error('unused');
    },
    streamChat,
    decide: async () => ({ kind: null }),
    undoAction: async () => {
      throw new Error('unused');
    },
    listActions: async () => [],
  };
  return createVoiceAskService({ companion, chat, clock: () => new Date() });
}

const events = (...list: ChatStreamEvent[]) =>
  (async function* () {
    yield* list;
  })();

describe('voice ask service stream', () => {
  it('forwards text and folds approvals and actions into one done', async () => {
    const approval = { id: 'oapr_1', kind: 'create_appointment', title: 'Book?', lines: [], expiresAt: null };
    const service = serviceWith(async () => ({
      preMs: 40,
      events: events(
        { type: 'text-delta', delta: 'Shall ' },
        { type: 'text-delta', delta: 'I? ' },
        { type: 'approval', approval },
        { type: 'done', suggestions: ['No'], awaitingReply: true, timing: { ttftMs: 300, llmMs: 500, toolsMs: 0, totalMs: 600 } },
      ),
    }));
    const stream = await service.askStream(caller, 'book');
    expect(stream.nerovaPreMs).toBe(40);
    const items = await collect(stream.events);
    expect(items.slice(0, 2)).toEqual([
      { type: 'text-delta', delta: 'Shall ' },
      { type: 'text-delta', delta: 'I? ' },
    ]);
    expect(items[2]).toMatchObject({
      type: 'done',
      data: { reply: 'Shall I?', approvals: [{ id: 'oapr_1', kind: 'create_appointment', title: 'Book?', lines: [] }], suggestions: ['No'], awaitingReply: true },
      timing: { ttftMs: 300 },
    });
  });

  it('maps an error event to our code and ends', async () => {
    const service = serviceWith(async () => ({
      preMs: null,
      events: events({ type: 'text-delta', delta: 'Hm' }, { type: 'error', error: { code: 'request.rate_limited', message: '', retryable: true } }),
    }));
    const items = await collect((await service.askStream(caller, 'x')).events);
    expect(items.at(-1)).toEqual({ type: 'error', code: 'RATE_LIMITED', retryable: true });
  });

  it('turns a dropped connection mid-stream into an error item, and a closed stream with text into done', async () => {
    const broken = serviceWith(async () => ({
      preMs: null,
      events: (async function* (): AsyncGenerator<ChatStreamEvent> {
        yield { type: 'text-delta', delta: 'Hi.' };
        throw new Error('socket closed');
      })(),
    }));
    expect((await collect((await broken.askStream(caller, 'x')).events)).at(-1)).toMatchObject({ type: 'error', retryable: true });
    const closed = serviceWith(async () => ({ preMs: null, events: events({ type: 'text-delta', delta: 'Hi.' }) }));
    expect((await collect((await closed.askStream(caller, 'x')).events)).at(-1)).toMatchObject({ type: 'done', data: { reply: 'Hi.' } });
    const empty = serviceWith(async () => ({ preMs: null, events: events() }));
    expect((await collect((await empty.askStream(caller, 'x')).events)).at(-1)).toMatchObject({ type: 'error' });
  });

  it('passes the abort signal to the client on both tries when the session expired', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    let first = true;
    const service = serviceWith(async (_s, _m, options) => {
      seen.push(options?.signal);
      if (first) {
        first = false;
        throw new AppError('UPSTREAM_COMPANION_ERROR', 'x', { status: 401, nerova_code: 'companion.session_expired' });
      }
      return { preMs: null, events: events({ type: 'done', suggestions: [] }) };
    });
    const controller = new AbortController();
    await service.askStream(caller, 'x', controller.signal);
    expect(seen).toEqual([controller.signal, controller.signal]);
  });
});

// ---- route ----

function streamRoute(items: VoiceStreamItem[], nerovaPreMs: number | null = 55) {
  const repo = createMemoryDeviceTokenRepository();
  repo.addMember({ businessId: BIZ, userId: OWNER_ID, orgId: ORG, role: 'owner' });
  const voiceTokens = createDeviceTokenService({ repo });
  const asked: { text: string; aborted: boolean }[] = [];
  const voiceAsk: VoiceAskService = {
    ask: async () => ({ reply: '', approvals: [], suggestions: [] }),
    askStream: async (_c, text, signal) => {
      asked.push({ text, aborted: signal?.aborted ?? false });
      return {
        nerovaPreMs,
        events: (async function* () {
          yield* items;
        })(),
      };
    },
    decide: async () => ({ id: 'x', decision: 'approved', kind: null }),
    undo: async () => {
      throw new Error('unused');
    },
    listActions: async () => [],
  };
  return { h: plansHarness({ overrides: { voiceTokens, voiceAsk } }), asked, voiceTokens };
}

const sseFrames = (text: string) =>
  text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => ({ event: /^event: (.*)$/m.exec(block)![1]!, data: JSON.parse(/^data: (.*)$/m.exec(block)![1]!) as Record<string, unknown> }));

describe('POST /v1/voice/ask/stream', () => {
  const done: VoiceStreamItem = {
    type: 'done',
    data: { reply: 'Two bookings.', approvals: [], actions: [], suggestions: [] },
    timing: { ttftMs: 300, llmMs: null, toolsMs: null, totalMs: 700 },
  };

  it('streams text-delta frames then a done frame with the whole data and timing', async () => {
    const { h, asked } = streamRoute([{ type: 'text-delta', delta: 'Two ' }, { type: 'text-delta', delta: 'bookings.' }, done]);
    const res = await h.call('POST', '/v1/voice/ask/stream', { body: { text: 'how is today' } });
    expect(res.status).toBe(200);
    const frames = sseFrames(res.text);
    expect(frames.map((f) => f.event)).toEqual(['text-delta', 'text-delta', 'done']);
    expect(frames[0]!.data).toEqual({ delta: 'Two ' });
    expect(frames[2]!.data).toMatchObject({ reply: 'Two bookings.', approvals: [], timing: { ttftMs: 300, totalMs: 700, nerovaPreMs: 55 } });
    expect(frames[2]!.data.timing).not.toHaveProperty('llmMs');
    expect(frames[2]!.data.timing).toHaveProperty('proxyFirstTextMs');
    expect(asked).toEqual([{ text: 'how is today', aborted: false }]);
  });

  it('has the SSE content type and our Server-Timing', async () => {
    const { h } = streamRoute([done]);
    const res = await h.app.request('/v1/voice/ask/stream', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'idempotency-key': 'stream-key-0001', 'content-type': 'application/json' },
      body: '{"text":"hi"}',
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('server-timing')).toMatch(/proxy-pre;dur=\d+, nerova-pre;dur=55/);
    await res.text();
  });

  it('writes an error frame for a failure after the first byte', async () => {
    const { h } = streamRoute([{ type: 'text-delta', delta: 'Hm' }, { type: 'error', code: 'RATE_LIMITED', retryable: true }]);
    const frames = sseFrames((await h.call('POST', '/v1/voice/ask/stream', { body: { text: 'hi' } })).text);
    expect(frames.at(-1)).toEqual({ event: 'error', data: { code: 'RATE_LIMITED', retryable: true } });
  });

  it('still requires an Idempotency-Key, validates the body and gates on the companion feature', async () => {
    const { h } = streamRoute([done]);
    const noKey = await h.app.request('/v1/voice/ask/stream', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: '{"text":"hi"}',
    });
    expect(noKey.status).toBe(400);
    expect((await h.call('POST', '/v1/voice/ask/stream', { body: { text: '  ' } })).status).toBe(400);
    const free = plansHarness({ plan: 'free' });
    expect((await free.call('POST', '/v1/voice/ask/stream', { body: { text: 'hi' } })).status).toBe(403);
  });

  it('does not store the stream for idempotent replay, so a retry asks again', async () => {
    const { h, asked } = streamRoute([done]);
    await h.call('POST', '/v1/voice/ask/stream', { body: { text: 'hi' }, key: 'stream-key-same-1' });
    await h.call('POST', '/v1/voice/ask/stream', { body: { text: 'hi' }, key: 'stream-key-same-1' });
    expect(asked).toHaveLength(2);
  });

  it('a device voice token can stream', async () => {
    const { h, voiceTokens } = streamRoute([done]);
    const token = await voiceTokens.mint({ businessId: BIZ, userId: OWNER_ID });
    const res = await h.app.request('/v1/voice/ask/stream', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'device-stream-0001', 'content-type': 'application/json' },
      body: '{"text":"hi"}',
    });
    expect(res.status).toBe(200);
    await res.text();
  });
});
