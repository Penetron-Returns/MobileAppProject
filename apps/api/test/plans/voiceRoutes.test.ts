import { afterEach, describe, expect, it, vi } from 'vitest';

import { createHttpNerovaClient } from '@booking/companion/nerova/httpClient.ts';
import { BIZ, NEROVA_KEY, plansHarness, type PlansHarness } from './harness.ts';

const ready = { id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' };
const ON = { VOICE_CLOUD_STT: 'true' } as const;
const PATH = '/v1/voice/transcriptions';
const SECRET_TEXT = 'my private transcript words';

let seq = 0;
function upload(
  h: PlansHarness,
  o: { token?: string | null; key?: string | null; audio?: Blob | null; filename?: string; language?: string; contentLength?: number } = {},
) {
  seq += 1;
  const form = new FormData();
  if (o.audio !== null) form.append('audio', o.audio ?? new Blob([new Uint8Array(1000)], { type: 'audio/wav' }), o.filename ?? 'clip.wav');
  if (o.language) form.append('language', o.language);
  const headers: Record<string, string> = {};
  if (o.token !== null) headers.authorization = `Bearer ${o.token ?? 'owner'}`;
  if (o.key !== null) headers['idempotency-key'] = o.key ?? `voice-test-key-${String(seq).padStart(6, '0')}`;
  if (o.contentLength !== undefined) headers['content-length'] = String(o.contentLength);
  return h.app.request(PATH, { method: 'POST', headers, body: form });
}
const json = async (res: Response) => (await res.json()) as any;

afterEach(() => vi.restoreAllMocks());

describe('POST /v1/voice/transcriptions', () => {
  it('rejects a missing token with 401', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { token: null });
    expect(res.status).toBe(401);
  });

  it('requires an Idempotency-Key', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { key: null });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('is 503 TRANSCRIPTION_UNAVAILABLE when the flag is off, without calling Nerova', async () => {
    const h = plansHarness({ accounts: [ready] });
    const res = await upload(h);
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe('TRANSCRIPTION_UNAVAILABLE');
    expect(h.nerova.transcriptionRequests).toEqual([]);
  });

  it('is 503 when the flag is anything but "true"', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: { VOICE_CLOUD_STT: 'yes' } }));
    expect(res.status).toBe(503);
  });

  it('gates on the companion feature (Free plan: 403 FEATURE_NOT_IN_PLAN)', async () => {
    const res = await upload(plansHarness({ plan: 'free', accounts: [ready], env: ON }));
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('FEATURE_NOT_IN_PLAN');
  });

  it.each(['owner', 'staff'] as const)('transcribes for %s and returns { text, duration_ms, language }', async (token) => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const res = await upload(h, { token });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ data: { text: 'book me a haircut tomorrow', duration_ms: 2300, language: 'en' } });
    expect(h.nerova.transcriptionRequests).toEqual([
      { accountId: 'acct_100', filename: 'clip.wav', contentType: 'audio/wav', size: 1000, language: undefined },
    ]);
  });

  it('forwards the language when the client sent one', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    await upload(h, { language: 'af' });
    expect(h.nerova.transcriptionRequests[0]?.language).toBe('af');
  });

  it('rejects a malformed language with 400', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { language: 'not a language!' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing audio field with 400 VALIDATION_FAILED', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { audio: null });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an empty clip with 400', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { audio: new Blob([], { type: 'audio/wav' }) });
    expect(res.status).toBe(400);
  });

  it('rejects a non-multipart body with 415', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const res = await h.app.request(PATH, {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'idempotency-key': 'voice-json-key-1', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(415);
    expect((await json(res)).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it.each([
    ['audio/wav', 'a.wav'],
    ['audio/mp4', 'a.m4a'],
    ['audio/webm;codecs=opus', 'a.webm'],
    ['audio/mpeg', 'a.mp3'],
    ['audio/ogg', 'a.ogg'],
    ['application/octet-stream', 'a.m4a'],
  ])('accepts %s (%s)', async (type, filename) => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { audio: new Blob([new Uint8Array(10)], { type }), filename });
    expect(res.status).toBe(200);
  });

  it.each([
    ['image/png', 'a.png'],
    ['application/octet-stream', 'a.exe'],
  ])('rejects %s (%s) with 415', async (type, filename) => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { audio: new Blob([new Uint8Array(10)], { type }), filename });
    expect(res.status).toBe(415);
  });

  it('rejects a file over 4 MiB with 413 PAYLOAD_TOO_LARGE', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const res = await upload(h, { audio: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'audio/wav' }) });
    expect(res.status).toBe(413);
    expect((await json(res)).error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(h.nerova.transcriptionRequests).toEqual([]);
  });

  it('accepts a file of exactly 4 MiB', async () => {
    const res = await upload(plansHarness({ accounts: [ready], env: ON }), { audio: new Blob([new Uint8Array(4 * 1024 * 1024)], { type: 'audio/wav' }) });
    expect(res.status).toBe(200);
  });

  it('rejects an oversized Content-Length with 413 before reading the body', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const res = await upload(h, { contentLength: 10 * 1024 * 1024 });
    expect(res.status).toBe(413);
    expect(h.nerova.transcriptionRequests).toEqual([]);
  });

  it('is 409 COMPANION_NOT_READY when the business has no Nerova account', async () => {
    const res = await upload(plansHarness({ accounts: [], env: ON }));
    expect(res.status).toBe(409);
    expect((await json(res)).error.details.reason).toBe('account_not_found');
  });

  it('does not store the multipart response for replay (no transcript in idempotency storage)', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const first = await upload(h, { key: 'voice-same-key-1' });
    const second = await upload(h, { key: 'voice-same-key-1' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('idempotent-replay')).toBeNull();
    expect(h.nerova.transcriptionRequests).toHaveLength(2);
  });

  it('never logs the transcript or the audio', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation((...a) => void lines.push(a.join(' ')));
    const h = plansHarness({ accounts: [ready], env: ON });
    h.nerova.transcription = { text: SECRET_TEXT, durationMs: 1000, language: 'en' };
    const res = await upload(h);
    expect(res.status).toBe(200);
    const logged = lines.join('\n');
    expect(logged).toContain('voice_transcription');
    expect(logged).toContain('"size_bytes":1000');
    expect(logged).not.toContain(SECRET_TEXT);
  });

  describe('Nerova error mapping (real HTTP client over a fake fetch)', () => {
    function withNerova(responder: () => Response) {
      const fetchImpl = (async (url: string | URL | Request) => {
        // Account lookups succeed; only the transcriptions call uses the responder.
        if (String(url).endsWith('/transcriptions')) return responder();
        return new Response(JSON.stringify({ id: 'acct_100', provisioningState: 'ready' }), { status: 200 });
      }) as typeof fetch;
      return plansHarness({ accounts: [ready], env: ON, nerovaClient: createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: fetchImpl }) });
    }
    const problem = (status: number, code: string, headers: Record<string, string> = {}) => () => new Response(JSON.stringify({ code }), { status, headers });

    it.each([
      [400, 'transcription.invalid_request', 400, 'VALIDATION_FAILED'],
      [413, 'transcription.too_long', 413, 'PAYLOAD_TOO_LARGE'],
      [415, 'transcription.unsupported_format', 415, 'UNSUPPORTED_MEDIA_TYPE'],
      [402, 'transcription.credits_unavailable', 502, 'UPSTREAM_COMPANION_ERROR'],
      [403, 'auth.scope_missing', 502, 'UPSTREAM_COMPANION_ERROR'],
      [503, 'transcription.provider_unavailable', 502, 'UPSTREAM_COMPANION_ERROR'],
    ])('Nerova %i %s becomes %i %s with details.reason', async (nerovaStatus, nerovaCode, status, code) => {
      const res = await upload(withNerova(problem(nerovaStatus, nerovaCode)));
      expect(res.status).toBe(status);
      const body = await json(res);
      expect(body.error.code).toBe(code);
      expect(body.error.details.reason).toBe(nerovaCode);
    });

    it('Nerova 429 becomes 429 RATE_LIMITED and passes Retry-After through', async () => {
      const res = await upload(withNerova(problem(429, 'transcription.rate_limited', { 'retry-after': '12' })));
      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBe('12');
      expect((await json(res)).error.code).toBe('RATE_LIMITED');
    });

    it('Nerova 404 becomes 503 TRANSCRIPTION_UNAVAILABLE', async () => {
      const res = await upload(withNerova(problem(404, 'not_found')));
      expect(res.status).toBe(503);
      expect((await json(res)).error.code).toBe('TRANSCRIPTION_UNAVAILABLE');
    });
  });
});

describe('voice transcription speed-ups', () => {
  it('forwards the m4a content type and file name to Nerova', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const res = await upload(h, { audio: new Blob([new Uint8Array(15_000)], { type: 'audio/mp4' }), filename: 'clovie-clip.m4a' });
    expect(res.status).toBe(200);
    expect(h.nerova.transcriptionRequests[0]).toMatchObject({ filename: 'clovie-clip.m4a', contentType: 'audio/mp4', size: 15_000 });
  });

  it('adds Nerova and proxy timings in Server-Timing and keeps them out of the body', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    h.nerova.transcription = { text: 'hello', durationMs: 900, language: 'en', timing: { providerMs: 700, totalMs: 912.4 } };
    const res = await upload(h);
    expect(res.headers.get('server-timing')).toMatch(/^nerova;dur=912, proxy;dur=\d+$/);
    expect(await json(res)).toEqual({ data: { text: 'hello', duration_ms: 900, language: 'en' } });
  });

  it('falls back to the provider time when Nerova sent no total, and sends only the proxy time when it sent neither', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    h.nerova.transcription = { text: 'a', durationMs: 1, language: null, timing: { providerMs: 400, totalMs: null } };
    expect((await upload(h)).headers.get('server-timing')).toMatch(/^nerova;dur=400, proxy;dur=\d+$/);
    h.nerova.transcription = { text: 'a', durationMs: 1, language: null };
    expect((await upload(h)).headers.get('server-timing')).toMatch(/^proxy;dur=\d+$/);
  });

  it('looks the Nerova account up once, then reuses it for later clips', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    const lookup = vi.spyOn(h.nerova, 'getAccount');
    for (let i = 0; i < 3; i += 1) expect((await upload(h)).status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(h.nerova.transcriptionRequests.map((r) => r.accountId)).toEqual(['acct_100', 'acct_100', 'acct_100']);
  });

  it('forgets a cached account Nerova no longer knows and resolves it again', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    expect((await upload(h)).status).toBe(200);
    h.nerova.accounts.splice(0, 1, { ...ready, id: 'acct_200' });
    expect((await upload(h)).status).toBe(200);
    expect(h.nerova.transcriptionRequests.map((r) => r.accountId)).toEqual(['acct_100', 'acct_200']);
  });

  it('still gates on the plan when the body is also invalid (the plan error wins)', async () => {
    const res = await upload(plansHarness({ plan: 'free', accounts: [ready], env: ON }), { audio: null });
    expect(res.status).toBe(403);
  });

  describe('GET /v1/voice/ping', () => {
    it('answers 200 to the owner with no side effects', async () => {
      const h = plansHarness({ accounts: [ready], env: ON });
      const res = await h.app.request('/v1/voice/ping', { headers: { authorization: 'Bearer owner' } });
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ data: { ok: true } });
      expect(h.nerova.transcriptionRequests).toEqual([]);
    });

    it('needs authentication', async () => {
      const res = await plansHarness({ accounts: [ready], env: ON }).app.request('/v1/voice/ping');
      expect(res.status).toBe(401);
    });
  });
});
