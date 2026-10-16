import { describe, expect, it } from 'vitest';

import { AUTH_CACHE_TTL_MS, createDeviceTokenService, TOUCH_INTERVAL_MS } from '@booking/features/voice/deviceTokens.ts';
import type { DeviceTokenRepository } from '@booking/features/voice/ports.ts';
import { createMemoryDeviceTokenRepository } from '@booking/testing/voiceTokens.ts';
import { BIZ, ORG, OWNER_ID, plansHarness } from './harness.ts';

const OTHER_BIZ = '10000000-0000-4000-8000-0000000000bb';

function setup(options: { failTouch?: boolean } = {}) {
  let now = Date.parse('2026-10-13T10:00:00.000Z');
  const memory = createMemoryDeviceTokenRepository();
  memory.addMember({ businessId: BIZ, userId: OWNER_ID, orgId: ORG, role: 'owner' });
  memory.addMember({ businessId: OTHER_BIZ, userId: 'user_other', orgId: 'org_other', role: 'staff' });
  const calls = { findByHash: 0, findMember: 0, touch: 0 };
  const repo: DeviceTokenRepository = {
    ...memory,
    findByHash: (hash) => ((calls.findByHash += 1), memory.findByHash(hash)),
    findMember: (owner) => ((calls.findMember += 1), memory.findMember(owner)),
    touch: async (id, at) => {
      calls.touch += 1;
      if (options.failTouch) throw new Error('db down');
      await memory.touch(id, at);
    },
  };
  const deferred: Array<() => Promise<unknown>> = [];
  const service = createDeviceTokenService({
    repo,
    clock: () => new Date(now),
    defer: (task) => void deferred.push(task),
  });
  return {
    memory,
    calls,
    service,
    deferred,
    advance: (ms: number) => void (now += ms),
    flush: async () => {
      for (const task of deferred.splice(0)) await task().catch(() => undefined);
    },
  };
}

describe('device token auth cache', () => {
  it('serves a repeat call with no database round trip', async () => {
    const s = setup();
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    expect(await s.service.authenticate(token)).toMatchObject({ businessId: BIZ, userId: OWNER_ID, orgId: ORG, role: 'owner' });
    expect(s.calls).toMatchObject({ findByHash: 1, findMember: 1 });
    await s.service.authenticate(token);
    await s.service.authenticate(token);
    expect(s.calls).toMatchObject({ findByHash: 1, findMember: 1 });
  });

  it('looks the token up again once the cache entry expires', async () => {
    const s = setup();
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    await s.service.authenticate(token);
    s.advance(AUTH_CACHE_TTL_MS - 1);
    await s.service.authenticate(token);
    expect(s.calls.findByHash).toBe(1);
    s.advance(1);
    await s.service.authenticate(token);
    expect(s.calls.findByHash).toBe(2);
  });

  it('documents revocation latency: a revoke elsewhere works within the TTL, and bites right after it', async () => {
    const s = setup();
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    await s.service.authenticate(token);
    // Another isolate revokes: this isolate only sees the database change, not the call.
    await s.memory.revokeAll({ businessId: BIZ, userId: OWNER_ID }, new Date());
    expect(await s.service.authenticate(token)).not.toBeNull();
    s.advance(AUTH_CACHE_TTL_MS);
    expect(await s.service.authenticate(token)).toBeNull();
  });

  it('a removed member is refused once the entry expires', async () => {
    const s = setup();
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    await s.service.authenticate(token);
    s.memory.removeMember({ businessId: BIZ, userId: OWNER_ID });
    s.advance(AUTH_CACHE_TTL_MS);
    expect(await s.service.authenticate(token)).toBeNull();
  });

  it('revoking or rotating through this service takes effect at once', async () => {
    const s = setup();
    const first = await s.service.mint({ businessId: BIZ, userId: OWNER_ID, deviceLabel: 'pixel' });
    await s.service.authenticate(first);
    const second = await s.service.mint({ businessId: BIZ, userId: OWNER_ID, deviceLabel: 'pixel' });
    expect(await s.service.authenticate(first)).toBeNull();
    expect(await s.service.authenticate(second)).not.toBeNull();
    await s.service.revoke({ businessId: BIZ, userId: OWNER_ID });
    expect(await s.service.authenticate(second)).toBeNull();
  });

  it('never leaks one token\'s identity to another token', async () => {
    const s = setup();
    const mine = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    const theirs = await s.service.mint({ businessId: OTHER_BIZ, userId: 'user_other' });
    expect(await s.service.authenticate(mine)).toMatchObject({ businessId: BIZ });
    expect(await s.service.authenticate(theirs)).toMatchObject({ businessId: OTHER_BIZ, userId: 'user_other' });
    expect(await s.service.authenticate(mine)).toMatchObject({ businessId: BIZ });
    // A near-miss of a cached token is not served from the cache.
    expect(await s.service.authenticate(`${mine.slice(0, -1)}${mine.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(await s.service.authenticate('cvt_unknown')).toBeNull();
  });

  it('does not cache failures', async () => {
    const s = setup();
    expect(await s.service.authenticate('cvt_not_minted_yet')).toBeNull();
    expect(await s.service.authenticate('cvt_not_minted_yet')).toBeNull();
    expect(s.calls.findByHash).toBe(2);
  });
});

describe('device token last-used throttle', () => {
  it('writes last_used_at off the request path and at most once per interval', async () => {
    const s = setup();
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    await s.service.authenticate(token);
    expect(s.calls.touch).toBe(0); // deferred, not awaited by the request
    await s.flush();
    expect(s.calls.touch).toBe(1);
    // Past the auth cache but inside the throttle window: another lookup, no second write.
    s.advance(AUTH_CACHE_TTL_MS);
    await s.service.authenticate(token);
    await s.flush();
    expect(s.calls.touch).toBe(1);
    s.advance(TOUCH_INTERVAL_MS);
    await s.service.authenticate(token);
    await s.flush();
    expect(s.calls.touch).toBe(2);
  });

  it('a failing bookkeeping write never blocks authentication', async () => {
    const s = setup({ failTouch: true });
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    expect(await s.service.authenticate(token)).not.toBeNull();
    await expect(s.flush()).resolves.toBeUndefined();
  });
});

describe('Server-Timing auth entry', () => {
  it('reports auth;dur on a device-token ping and a transcription', async () => {
    const s = setup();
    const token = await s.service.mint({ businessId: BIZ, userId: OWNER_ID });
    const h = plansHarness({
      env: { VOICE_CLOUD_STT: 'true' },
      accounts: [{ id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' }],
      overrides: { voiceTokens: s.service },
    });
    const ping = await h.app.request('/v1/voice/ping', { headers: { authorization: `Bearer ${token}` } });
    expect(ping.status).toBe(200);
    expect(ping.headers.get('server-timing')).toMatch(/^auth;dur=\d+$/);

    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(1000)], { type: 'audio/wav' }), 'clip.wav');
    const res = await h.app.request('/v1/voice/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'voice-timing-key-000001' },
      body: form,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('server-timing')).toMatch(/proxy;dur=\d+, auth;dur=\d+$/);
  });
});
