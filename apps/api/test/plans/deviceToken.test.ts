import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUTH_CACHE_TTL_MS, createDeviceTokenService, hashDeviceToken } from '@booking/features/voice/deviceTokens.ts';
import { createMemoryDeviceTokenRepository } from '@booking/testing/voiceTokens.ts';
import type { AttendanceService } from '@booking/features/ports.ts';
import { isDeviceTokenRoute } from '../../src/middleware/deviceToken.ts';
import { BIZ, ORG, OWNER_ID, plansHarness } from './harness.ts';

const ON = { VOICE_CLOUD_STT: 'true' } as const;
const TRANSCRIBE = '/v1/voice/transcriptions';
const ANSWER = '/v1/attendance/9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11/answer';
const STAFF_ID = 'user_staff';

function setup(clock?: () => Date) {
  const repo = createMemoryDeviceTokenRepository();
  repo.addMember({ businessId: BIZ, userId: OWNER_ID, orgId: ORG, role: 'owner' });
  repo.addMember({ businessId: BIZ, userId: STAFF_ID, orgId: ORG, role: 'staff' });
  const voiceTokens = createDeviceTokenService({ repo, ...(clock ? { clock } : {}) });
  const answers: unknown[] = [];
  const attendance = {
    answer: async (caller: unknown, checkId: string, outcome: string) => {
      answers.push({ caller, checkId, outcome });
      return { id: checkId, outcome };
    },
  } as unknown as AttendanceService;
  const h = plansHarness({ env: ON, accounts: [{ id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' }], overrides: { voiceTokens, attendance } });
  return { h, repo, answers };
}

let seq = 0;
const key = () => `voice-token-key-${String((seq += 1)).padStart(6, '0')}`;

function upload(h: ReturnType<typeof setup>['h'], token: string) {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(1000)], { type: 'audio/wav' }), 'clip.wav');
  return h.app.request(TRANSCRIBE, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': key() }, body: form });
}

const answer = (h: ReturnType<typeof setup>['h'], token: string) =>
  h.app.request(ANSWER, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key(), 'content-type': 'application/json' },
    body: JSON.stringify({ outcome: 'came' }),
  });

async function mint(h: ReturnType<typeof setup>['h'], as: 'owner' | 'staff' = 'owner', body: unknown = {}) {
  const res = await h.call('POST', '/v1/voice/device-token', { token: as, body });
  return { res, token: (res.body as { data?: { token?: string } } | null)?.data?.token ?? '' };
}

afterEach(() => vi.restoreAllMocks());

describe('POST /v1/voice/device-token', () => {
  it('mints a cvt_ token once and stores only its SHA-256 hash', async () => {
    const { h, repo } = setup();
    const { res, token } = await mint(h);
    expect(res.status).toBe(201);
    expect(token).toMatch(/^cvt_[A-Za-z0-9_-]{43}$/);
    expect(repo.records).toHaveLength(1);
    expect(repo.records[0]!.token_hash).toBe(hashDeviceToken(token));
    expect(JSON.stringify(repo.records)).not.toContain(token);
  });

  it('rotates: a new token for the same user and device revokes the previous one', async () => {
    const { h, repo } = setup();
    const first = (await mint(h, 'owner', { device_label: 'pixel' })).token;
    const second = (await mint(h, 'owner', { device_label: 'pixel' })).token;
    expect(first).not.toBe(second);
    expect((await upload(h, first)).status).toBe(401);
    expect((await upload(h, second)).status).toBe(200);
    expect(repo.records.filter((r) => !r.revoked_at)).toHaveLength(1);
  });

  it('keeps another device and another user live', async () => {
    const { h } = setup();
    const phone = (await mint(h, 'owner', { device_label: 'phone' })).token;
    const tablet = (await mint(h, 'owner', { device_label: 'tablet' })).token;
    const staff = (await mint(h, 'staff')).token;
    for (const t of [phone, tablet, staff]) expect((await upload(h, t)).status).toBe(200);
  });

  it('refuses a device token as the credential for minting', async () => {
    const { h } = setup();
    const { token } = await mint(h);
    const res = await h.app.request('/v1/voice/device-token', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key(), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('does not persist the response (it holds the secret) in idempotency storage', async () => {
    const { h } = setup();
    const { token } = await mint(h);
    expect(token).not.toBe('');
    // The harness shares one in-memory idempotency store: replaying the key must mint afresh, not replay.
    const a = await h.call('POST', '/v1/voice/device-token', { body: {}, key: 'same-key-for-both-calls' });
    const b = await h.call('POST', '/v1/voice/device-token', { body: {}, key: 'same-key-for-both-calls' });
    expect(a.body.data.token).not.toBe(b.body.data.token);
  });
});

describe('DELETE /v1/voice/device-token', () => {
  it('revokes the caller tokens so they stop working, leaving other users alone', async () => {
    const { h } = setup();
    const owner = (await mint(h, 'owner')).token;
    const staff = (await mint(h, 'staff')).token;
    const res = await h.call('DELETE', '/v1/voice/device-token', { token: 'owner' });
    expect(res.status).toBe(200);
    expect((await upload(h, owner)).status).toBe(401);
    expect((await upload(h, staff)).status).toBe(200);
  });
});

describe('device token authentication', () => {
  it('is accepted on the transcription route with the same gates (flag, plan) and idempotency key', async () => {
    const { h } = setup();
    const { token } = await mint(h);
    expect((await upload(h, token)).status).toBe(200);
    const noKey = new FormData();
    noKey.append('audio', new Blob([new Uint8Array(10)], { type: 'audio/wav' }), 'clip.wav');
    const res = await h.app.request(TRANSCRIBE, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: noKey });
    expect(res.status).toBe(400);
    const off = plansHarness({ accounts: [{ id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' }], overrides: { voiceTokens: h.container.voiceTokens } });
    expect((await upload(off as never, token)).status).toBe(503);
  });

  it('passes authentication on the check-in route (the handler runs; the fake db then fails, not auth)', async () => {
    const { h } = setup();
    const { token } = await mint(h, 'staff');
    const res = await h.app.request('/v1/appointments/9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11/check-in', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': key(), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).not.toBe(401);
    const after = setup();
    const t2 = (await mint(after.h, 'staff')).token;
    after.repo.removeMember({ businessId: BIZ, userId: STAFF_ID });
    const revoked = await after.h.app.request('/v1/appointments/9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11/check-in', {
      method: 'POST',
      headers: { authorization: `Bearer ${t2}`, 'idempotency-key': key(), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(revoked.status).toBe(401);
  });

  it('is accepted on the attendance answer route as the member it was minted for', async () => {
    const { h, answers } = setup();
    const { token } = await mint(h, 'staff');
    const res = await answer(h, token);
    expect(res.status).toBe(200);
    expect(answers).toEqual([
      { caller: { userId: STAFF_ID, role: 'staff', businessId: BIZ }, checkId: '9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11', outcome: 'came' },
    ]);
  });

  it.each([
    ['GET', '/v1/attendance/pending'],
    ['GET', '/v1/me'],
    ['GET', '/v1/business'],
    ['POST', '/v1/appointments'],
    ['POST', '/v1/appointments/9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11/status'],
    ['GET', '/v1/appointments/9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11/check-in'],
    ['POST', '/v1/appointments/9d6a7a0e-6c4c-4f43-8a0d-1c5d2f6f1a11/check-in/x'],
    ['PATCH', '/v1/business'],
    ['DELETE', '/v1/voice/device-token'],
    ['GET', TRANSCRIBE],
    ['GET', ANSWER],
    ['POST', `${ANSWER}/extra`],
    ['POST', '/v1/whatsapp/connect'],
  ])('rejects a device token on %s %s with 401, before any handler runs', async (method, path) => {
    const { h } = setup();
    const { token } = await mint(h);
    const res = await h.app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'idempotency-key': key() } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown, malformed and over-long cvt_ tokens with 401', async () => {
    const { h } = setup();
    for (const t of ['cvt_unknownunknownunknownunknownunknownunknownxxx', 'cvt_', `cvt_${'a'.repeat(500)}`]) {
      expect((await upload(h, t)).status).toBe(401);
    }
  });

  it('rejects a revoked token', async () => {
    const { h, repo } = setup();
    const { token } = await mint(h);
    repo.records[0]!.revoked_at = new Date().toISOString();
    expect((await upload(h, token)).status).toBe(401);
  });

  it('rejects the token once its member is removed from the business', async () => {
    let now = Date.now();
    const { h, repo } = setup(() => new Date(now));
    const { token } = await mint(h, 'staff');
    expect((await upload(h, token)).status).toBe(200);
    repo.removeMember({ businessId: BIZ, userId: STAFF_ID });
    now += AUTH_CACHE_TTL_MS; // verified tokens are trusted in-isolate for this long
    expect((await upload(h, token)).status).toBe(401);
    expect((await answer(h, token)).status).toBe(401);
  });

  it('uses the role of the current membership', async () => {
    const { h, repo, answers } = setup();
    const { token } = await mint(h, 'staff');
    repo.addMember({ businessId: BIZ, userId: STAFF_ID, orgId: ORG, role: 'owner' });
    await answer(h, token);
    expect((answers[0] as { caller: { role: string } }).caller.role).toBe('owner');
  });

  it('records last_used_at on use', async () => {
    const { h, repo } = setup();
    const { token } = await mint(h);
    expect(repo.records[0]!.last_used_at).toBeNull();
    await upload(h, token);
    expect(repo.records[0]!.last_used_at).not.toBeNull();
  });

  it('still lets a Clerk session token through unchanged', async () => {
    const { h } = setup();
    expect((await upload(h, 'owner')).status).toBe(200);
    expect((await upload(h, 'garbage')).status).toBe(401);
  });

  it('never writes the token to any log line', async () => {
    const lines: string[] = [];
    for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.join(' ')));
    const { h } = setup();
    const { token } = await mint(h);
    await upload(h, token);
    await h.app.request('/v1/business', { method: 'GET', headers: { authorization: `Bearer ${token}` } });
    await upload(h, `${token}x`);
    await h.call('DELETE', '/v1/voice/device-token');
    await upload(h, token);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((l) => l.includes(token) || l.includes(token.slice(4)))).toEqual([]);
  });
});

describe('isDeviceTokenRoute', () => {
  it.each([
    ['POST', '/v1/voice/transcriptions', true],
    ['POST', '/api/v1/voice/transcriptions', true],
    ['POST', '/api/v1/attendance/abc/answer', true],
    ['POST', '/v1/appointments/abc/check-in', true],
    ['POST', '/api/v1/appointments/abc/check-in', true],
    ['POST', '/v1/appointments/abc/status', false],
    ['GET', '/v1/voice/today', true],
    ['GET', '/v1/voice/ping', true],
    ['GET', '/api/v1/voice/ping', true],
    ['POST', '/v1/voice/ping', false],
    ['GET', '/v1/voice/ping/x', false],
    ['GET', '/api/v1/voice/today', true],
    ['POST', '/v1/voice/today', false],
    ['GET', '/v1/voice/today/x', false],
    ['GET', '/v1/voice/transcriptions', false],
    ['POST', '/v1/voice/transcriptions/', false],
    ['POST', '/v1/attendance/a/b/answer', false],
    ['POST', '/v1/voice/device-token', false],
    ['POST', '/v1/appointments', false],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(isDeviceTokenRoute(method, path)).toBe(expected);
  });

});
