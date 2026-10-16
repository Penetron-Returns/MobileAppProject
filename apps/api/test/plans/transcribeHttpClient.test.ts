import { describe, expect, it } from 'vitest';

import { createHttpNerovaClient } from '@booking/companion/nerova/httpClient.ts';
import { NEROVA_KEY } from './harness.ts';

function fakeFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return responder(String(url), init ?? {});
  }) as typeof fetch;
  return { calls, impl };
}

const ok = () => new Response(JSON.stringify({ text: 'hello there', durationMs: 1800, language: 'af' }), { status: 200, headers: { 'server-timing': 'stt;dur=412.5' } });
const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code }), { status, headers: { 'content-type': 'application/problem+json', ...headers } });
const file = { data: new Blob([new Uint8Array(64)], { type: 'audio/wav' }), filename: 'clip.wav', contentType: 'audio/wav' };

describe('NerovaClient.transcribe (HTTP)', () => {
  it('posts multipart to the account transcriptions URL with the bearer key and an audio field only', async () => {
    const f = fakeFetch(ok);
    const result = await createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl }).transcribe('acct_1', file);
    expect(result).toEqual({ text: 'hello there', durationMs: 1800, language: 'af' });
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.nerova.si/v1/accounts/acct_1/transcriptions');
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${NEROVA_KEY}`);
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
    const form = call.init.body as FormData;
    expect([...form.keys()]).toEqual(['audio']);
    const part = form.get('audio') as File;
    expect(part.name).toBe('clip.wav');
    expect(part.size).toBe(64);
  });

  it('sends language only when given', async () => {
    const f = fakeFetch(ok);
    await createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl }).transcribe('acct_1', file, { language: 'af' });
    expect((f.calls[0]!.init.body as FormData).get('language')).toBe('af');
  });

  it('percent-encodes the account id', async () => {
    const f = fakeFetch(ok);
    await createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: f.impl }).transcribe('a/b', file);
    expect(f.calls[0]!.url).toBe('https://api.nerova.si/v1/accounts/a%2Fb/transcriptions');
  });

  it.each([
    [400, 'transcription.invalid_request', 'VALIDATION_FAILED'],
    [413, 'transcription.too_long', 'PAYLOAD_TOO_LARGE'],
    [415, 'transcription.unsupported_format', 'UNSUPPORTED_MEDIA_TYPE'],
    [402, 'transcription.credits_unavailable', 'UPSTREAM_COMPANION_ERROR'],
    [403, 'auth.scope_missing', 'UPSTREAM_COMPANION_ERROR'],
    [503, 'transcription.provider_unavailable', 'UPSTREAM_COMPANION_ERROR'],
  ])('maps %i %s to %s', async (status, code, expected) => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => problem(status, code)).impl });
    await expect(client.transcribe('acct_1', file)).rejects.toMatchObject({ code: expected, details: { reason: code } });
  });

  it('maps 429 to RATE_LIMITED with the Retry-After seconds', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => problem(429, 'transcription.rate_limited', { 'retry-after': '7' })).impl });
    await expect(client.transcribe('acct_1', file)).rejects.toMatchObject({ code: 'RATE_LIMITED', details: { retry_after_s: 7 } });
  });

  it('maps 404 (route not deployed) to TRANSCRIPTION_UNAVAILABLE', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => problem(404, 'not_found')).impl });
    await expect(client.transcribe('acct_1', file)).rejects.toMatchObject({ code: 'TRANSCRIPTION_UNAVAILABLE', status: 503 });
  });

  it('maps a timeout and a network failure to UPSTREAM_COMPANION_ERROR with a reason', async () => {
    const timeout = createHttpNerovaClient({
      apiKey: NEROVA_KEY,
      fetch: (async () => {
        throw new DOMException('t', 'TimeoutError');
      }) as typeof fetch,
    });
    await expect(timeout.transcribe('acct_1', file)).rejects.toMatchObject({ code: 'UPSTREAM_COMPANION_ERROR', details: { reason: 'timeout' } });
    const network = createHttpNerovaClient({
      apiKey: NEROVA_KEY,
      fetch: (async () => {
        throw new TypeError('x');
      }) as typeof fetch,
    });
    await expect(network.transcribe('acct_1', file)).rejects.toMatchObject({ details: { reason: 'network' } });
  });

  it('rejects a 200 without text or durationMs', async () => {
    const client = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fakeFetch(() => new Response('{}', { status: 200 })).impl });
    await expect(client.transcribe('acct_1', file)).rejects.toMatchObject({ details: { reason: 'unexpected_response' } });
  });
});
