import { setAuthTokenGetter, setDeviceTokenSource } from '@/lib/auth-token';

import {
  createFillerGate,
  createSseParser,
  isStreamUnavailable,
  readAskStream,
  streamVoiceAsk,
  type ByteReader,
} from '../askStream';

jest.mock('@/lib/env', () => ({
  env: { apiUrl: 'https://api.example.com' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key' }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const enc = new TextEncoder();

function readerOf(chunks: string[]): ByteReader & { cancelled: boolean } {
  const queue = chunks.map((c) => enc.encode(c));
  const reader = {
    cancelled: false,
    read: async () => {
      const value = queue.shift();
      return value ? { done: false, value } : { done: true };
    },
    cancel: async () => {
      reader.cancelled = true;
    },
  };
  return reader;
}

describe('createSseParser', () => {
  it('returns a frame only when its blank line has arrived, whatever the chunking', () => {
    const body = frame('text-delta', { delta: 'Hi ' }) + frame('done', {});
    for (let cut = 1; cut < body.length; cut++) {
      const parser = createSseParser();
      const frames = [
        ...parser.push(body.slice(0, cut)),
        ...parser.push(body.slice(cut)),
        ...parser.flush(),
      ];
      expect(frames.map((f) => f.event)).toEqual(['text-delta', 'done']);
    }
  });

  it('handles CRLF split across chunks and skips comments', () => {
    const parser = createSseParser();
    const a = parser.push(
      ': ping\r\n\r\nevent: text-delta\r\ndata: {"delta":"x"}\r',
    );
    const b = parser.push('\n\r\n');
    expect([...a, ...b]).toEqual([
      { event: 'text-delta', data: '{"delta":"x"}' },
    ]);
  });
});

describe('readAskStream', () => {
  const done = frame('done', {
    reply: 'Two bookings.',
    approvals: [{ id: 'a1', kind: 'create_appointment', title: 'Book?' }],
    actions: [],
    suggestions: ['Show'],
    awaitingReply: false,
    timing: { proxyPreMs: 1, proxyTotalMs: 2 },
  });

  it('hands each delta on as it arrives and returns the whole reply at done', async () => {
    const seen: string[] = [];
    const firstByte = jest.fn();
    const result = await readAskStream(
      readerOf([
        frame('text-delta', { delta: 'Two ' }).slice(0, 15),
        frame('text-delta', { delta: 'Two ' }).slice(15) +
          frame('text-delta', { delta: 'bookings.' }),
        done,
      ]),
      { onText: (d) => seen.push(d), onFirstByte: firstByte },
    );
    expect(seen).toEqual(['Two ', 'bookings.']);
    expect(firstByte).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      reply: 'Two bookings.',
      approvals: [{ id: 'a1', kind: 'create_appointment', title: 'Book?' }],
      actions: [],
      suggestions: ['Show'],
      awaitingReply: false,
    });
  });

  it('throws an ApiError with our code for an error frame', async () => {
    await expect(
      readAskStream(
        readerOf([
          frame('text-delta', { delta: 'Hm' }),
          frame('error', { code: 'RATE_LIMITED', retryable: true }),
        ]),
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('throws NETWORK_ERROR when the stream ends without done', async () => {
    await expect(
      readAskStream(readerOf([frame('text-delta', { delta: 'Hm' })])),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('stops and cancels the reader when the command is no longer active', async () => {
    const reader = readerOf([frame('text-delta', { delta: 'a' }), done]);
    let calls = 0;
    await expect(
      readAskStream(reader, { isActive: () => ++calls < 2 }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(reader.cancelled).toBe(true);
  });

  it('never puts text in an error', async () => {
    const error = await readAskStream(
      readerOf([frame('error', { code: 'weird code with Sipho' })]),
    ).catch((e: Error) => e);
    expect((error as Error).message).not.toContain('Sipho');
  });
});

describe('streamVoiceAsk', () => {
  beforeEach(() => {
    setAuthTokenGetter(async () => 'clerk-token');
    setDeviceTokenSource(null);
  });

  const okResponse = (chunks: string[]) =>
    ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { getReader: () => readerOf(chunks) },
    }) as unknown as Response;

  it('posts the text with the key and bearer, and returns the reply', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        okResponse([
          frame('text-delta', { delta: 'Hi.' }),
          frame('done', { reply: 'Hi.', approvals: [] }),
        ]),
      );
    const out = await streamVoiceAsk(
      'hello',
      'idem-key-1',
      {},
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(out.reply).toBe('Hi.');
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/voice/ask/stream');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer clerk-token',
      'Idempotency-Key': 'idem-key-1',
    });
    expect(JSON.parse(init.body as string)).toEqual({ text: 'hello' });
  });

  it('aborts the HTTP request when the command stops being active', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    });
    await expect(
      streamVoiceAsk(
        'hi',
        'idem-key-2',
        { isActive: () => false },
        { fetchImpl: fetchImpl as unknown as typeof fetch, pollMs: 5 },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal?.aborted).toBe(true);
  });

  it('turns a 404 into an ApiError the caller reads as "no stream route yet"', async () => {
    const res = {
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No route' } }),
    } as unknown as Response;
    const error = await streamVoiceAsk(
      'hi',
      'idem-key-3',
      {},
      { fetchImpl: (async () => res) as unknown as typeof fetch },
    ).catch((e: unknown) => e);
    expect(isStreamUnavailable(error)).toBe(true);
    expect(isStreamUnavailable({ status: 500 })).toBe(false);
  });
});

describe('createFillerGate', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('speaks after the delay, unless cancelled by the first text', () => {
    const speak = jest.fn();
    const gate = createFillerGate(speak, 1200);
    gate.schedule('One sec', true);
    jest.advanceTimersByTime(1199);
    expect(speak).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(speak).toHaveBeenCalledWith('One sec');
    gate.schedule('Again', true);
    gate.cancel();
    jest.advanceTimersByTime(5000);
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('speaks at once when streaming is off', () => {
    const speak = jest.fn();
    createFillerGate(speak, 1200).schedule('One sec', false);
    expect(speak).toHaveBeenCalledWith('One sec');
  });
});
