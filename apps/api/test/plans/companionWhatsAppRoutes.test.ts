import { describe, expect, it } from 'vitest';

import { AppError } from '@booking/features/lib/errors.ts';
import { connectSessionIdempotencyKey } from '@booking/companion/nerova/companionService.ts';
import { BIZ, EMBED_ORIGIN, NEROVA_KEY, NOW, plansHarness } from './harness.ts';

const ready = { id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' };
const setupPath = '/v1/companion/setup';

describe('GET /v1/companion/setup', () => {
  const live = {
    ...ready,
    nextStep: 'none',
    receptionistLive: true,
    whatsapp: { connected: true, state: 'connected', displayPhoneNumber: '+27 82 000 0000', businessVerified: true },
  };
  const none = {
    next_step: 'connect_booking_system',
    whatsapp: { connected: false, state: 'not_connected', display_phone_number: null, business_verified: false },
    companion_live: false,
  };

  it('returns the next step and WhatsApp status for the owner', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [{ ...ready, nextStep: 'connect_whatsapp' }] });
    const r = await h.call('GET', setupPath);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ ...none, next_step: 'connect_whatsapp' });
  });

  it('reports a connected, live companion', async () => {
    const r = await plansHarness({ plan: 'pro', accounts: [live] }).call('GET', setupPath);
    expect(r.body.data).toEqual({
      next_step: 'none',
      whatsapp: { connected: true, state: 'connected', display_phone_number: '+27 82 000 0000', business_verified: true },
      companion_live: true,
    });
  });

  it('is connect_booking_system with nothing connected when Nerova has no account yet', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [] }).call('GET', setupPath);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual(none);
  });

  it('is 403 FORBIDDEN for staff', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [ready] }).call('GET', setupPath, { token: 'staff' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
  });

  it('is 403 FEATURE_NOT_IN_PLAN on Free', async () => {
    const r = await plansHarness({ plan: 'free', accounts: [ready] }).call('GET', setupPath);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', details: { feature: 'companion' } });
  });

  it('is 401 without a token', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    expect((await h.app.request(setupPath)).status).toBe(401);
  });

  it('is COMPANION_NOT_READY / unavailable when unconfigured, and 502 on an outage', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    h.nerova.failWith = new AppError('COMPANION_NOT_READY', 'The companion is not available yet', { reason: 'unavailable' });
    const down = await h.call('GET', setupPath);
    expect(down.status).toBe(409);
    expect(down.body.error.details).toEqual({ reason: 'unavailable' });
    h.nerova.failWith = new AppError('UPSTREAM_COMPANION_ERROR', 'timed out', { reason: 'timeout' });
    expect((await h.call('GET', setupPath)).status).toBe(502);
  });

  it('is 502 when Nerova returns an unknown next step', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [{ ...ready, nextStep: 'teleport' }] }).call('GET', setupPath);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('UPSTREAM_COMPANION_ERROR');
  });
});

describe('POST /v1/companion/whatsapp/connect-session', () => {
  const path = '/v1/companion/whatsapp/connect-session';
  const launchUrl = 'https://app.nerova.test/connect/whatsapp/pacs_acct_100#state=launch-secret';

  it('returns 201 with the launch url untouched and the expiry, from the embed origin and the setup version', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [{ ...ready, activationVersion: 4 }] });
    const r = await h.call('POST', path);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ launch_url: launchUrl, expires_at: new Date(NOW.getTime() + 10 * 60_000).toISOString() });
    expect(h.nerova.connectionSessionRequests).toEqual([
      { accountId: 'acct_100', embedOrigin: EMBED_ORIGIN, expectedVersion: 4, idempotencyKey: 'companion-wa-connect-acct_100-2026-10-13T10:00-v4' },
    ]);
  });

  it('accepts an optional return_url but does not forward it yet, and rejects a malformed one', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const ok = await h.call('POST', path, { body: { return_url: 'https://app.example.test/done' } });
    expect(ok.status).toBe(201);
    expect(h.nerova.connectionSessionRequests[0]).not.toHaveProperty('returnUrl');
    const bad = await h.call('POST', path, { body: { return_url: 'not a url' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('is 403 FORBIDDEN for staff and never reaches Nerova', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const r = await h.call('POST', path, { token: 'staff' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(h.nerova.connectionSessionRequests).toHaveLength(0);
  });

  it('is 403 FEATURE_NOT_IN_PLAN on Free', async () => {
    const h = plansHarness({ plan: 'free', accounts: [ready] });
    const r = await h.call('POST', path);
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', details: { feature: 'companion' } });
    expect(h.nerova.connectionSessionRequests).toHaveLength(0);
  });

  it('requires an Idempotency-Key', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const res = await h.app.request(path, { method: 'POST', headers: { authorization: 'Bearer owner' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('replays the stored response for the same Idempotency-Key without a second Nerova session', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const first = await h.call('POST', path, { key: 'wa-connect-key-0001' });
    const second = await h.call('POST', path, { key: 'wa-connect-key-0001' });
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(h.nerova.connectionSessionRequests).toHaveLength(1);
  });

  it('is 409 WHATSAPP_ALREADY_CONNECTED when already connected, without creating a session', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [{ ...ready, whatsapp: { connected: true, state: 'connected' } }] });
    const r = await h.call('POST', path);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('WHATSAPP_ALREADY_CONNECTED');
    expect(h.nerova.connectionSessionRequests).toHaveLength(0);
  });

  it('is 409 COMPANION_NOT_READY / account_not_found without a Nerova account', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [] }).call('POST', path);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason: 'account_not_found', next_step: 'connect_booking_system' } });
  });

  it('is 409 COMPANION_NOT_READY / not_provisioned with the next step for an unprovisioned account', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [{ ...ready, provisioningState: 'pending', nextStep: 'provision_account' }] });
    const r = await h.call('POST', path);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason: 'not_provisioned', next_step: 'provision_account' } });
    expect(h.nerova.connectionSessionRequests).toHaveLength(0);
  });

  it('is COMPANION_NOT_READY / unavailable when the embed origin is not configured', async () => {
    const r = await plansHarness({ plan: 'growth', accounts: [ready], embedOrigin: undefined }).call('POST', path);
    expect(r.status).toBe(409);
    expect(r.body.error.details).toEqual({ reason: 'unavailable' });
  });

  it('re-reads the setup once when the activation version moved, then succeeds', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [{ ...ready, activationVersion: 4 }] });
    h.nerova.versionConflicts = 1;
    const r = await h.call('POST', path);
    expect(r.status).toBe(201);
    expect(h.nerova.connectionSessionRequests.map((q) => q.expectedVersion)).toEqual([4, 5]);
  });

  it('gives up with 502 UPSTREAM_COMPANION_ERROR when the version keeps moving', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    h.nerova.versionConflicts = 5;
    const r = await h.call('POST', path);
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('UPSTREAM_COMPANION_ERROR');
    expect(h.nerova.connectionSessionRequests).toHaveLength(2);
  });

  it('maps a Nerova outage to 502 and never leaks the key or a launch url', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    h.nerova.failWith = new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service timed out', { reason: 'timeout' });
    const r = await h.call('POST', path);
    expect(r.status).toBe(502);
    expect(r.text).not.toContain(NEROVA_KEY);
    expect(r.text).not.toContain('#state=');
  });
});

describe('connectSessionIdempotencyKey', () => {
  it('is deterministic per account, minute and version, and within 8 to 128 characters', () => {
    const at = new Date('2026-10-13T10:00:59.000Z');
    expect(connectSessionIdempotencyKey('acct_1', at, 4)).toBe('companion-wa-connect-acct_1-2026-10-13T10:00-v4');
    expect(connectSessionIdempotencyKey('acct_1', at, 5)).not.toBe(connectSessionIdempotencyKey('acct_1', at, 4));
    const long = connectSessionIdempotencyKey('a'.repeat(300), at, 4);
    expect(long.length).toBeLessThanOrEqual(128);
    expect(long.length).toBeGreaterThanOrEqual(8);
  });
});
