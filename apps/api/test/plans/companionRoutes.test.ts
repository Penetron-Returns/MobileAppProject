import { describe, expect, it } from 'vitest';

import { AppError } from '@booking/features/lib/errors.ts';
import { sessionIdempotencyKey } from '@booking/companion/nerova/companionService.ts';
import { appt, BIZ, EMBED_ORIGIN, NEROVA_KEY, NOW, OWNER_ID, plansHarness } from './harness.ts';

const ready = { id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' };

describe('POST /v1/companion/session', () => {
  it('mints an owner_chat session for the Clerk user and returns only url and expires_at', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'dark' } });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      url: 'https://chat.nerova.test/s/acct_100?secret=session-secret',
      expires_at: new Date(NOW.getTime() + 15 * 60_000).toISOString(),
    });
    expect(h.nerova.sessionRequests).toEqual([
      {
        accountId: 'acct_100',
        origin: EMBED_ORIGIN,
        ownerReference: OWNER_ID,
        colorMode: 'dark',
        idempotencyKey: `companion-session-acct_100-${OWNER_ID}-2026-10-13T10:00-dark`,
      },
    ]);
  });

  it('resolves the account by our business id (externalReference) and caches the acct_ id', async () => {
    const h = plansHarness({ plan: 'starter', accounts: [ready] });
    expect((await h.plans.getProfile(BIZ)).nerovaAccountId).toBeNull();
    await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect((await h.plans.getProfile(BIZ)).nerovaAccountId).toBe('acct_100');
  });

  it('uses a cached account id, and falls back to the business id when the cached one is gone', async () => {
    const stale = plansHarness({ plan: 'pro', accounts: [ready], cachedAccountId: 'acct_old' });
    const r = await stale.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect(r.status).toBe(200);
    expect(stale.nerova.sessionRequests[0]?.accountId).toBe('acct_100');
    expect((await stale.plans.getProfile(BIZ)).nerovaAccountId).toBe('acct_100');
  });

  it('is 403 FEATURE_NOT_IN_PLAN on the Free plan and never reaches Nerova', async () => {
    const h = plansHarness({ plan: 'free', accounts: [ready] });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', details: { feature: 'companion' } });
    expect(h.nerova.sessionRequests).toHaveLength(0);
  });

  it('is 409 COMPANION_NOT_READY / account_not_found when Nerova has no such account', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [] });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason: 'account_not_found', next_step: 'connect_booking_system' } });
    expect(h.nerova.sessionRequests).toHaveLength(0);
  });

  it('is 409 COMPANION_NOT_READY / not_provisioned with Nerova\'s next step for an unprovisioned account', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [{ ...ready, provisioningState: 'pending', nextStep: 'verify_booking_connection' }] });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'COMPANION_NOT_READY', details: { reason: 'not_provisioned', next_step: 'verify_booking_connection' } });
  });

  it('is COMPANION_NOT_READY / unavailable when the embed origin is not configured', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready], embedOrigin: undefined });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect(r.status).toBe(409);
    expect(r.body.error.details).toEqual({ reason: 'unavailable' });
  });

  it('maps a Nerova outage to 502 UPSTREAM_COMPANION_ERROR', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    h.nerova.failWith = new AppError('UPSTREAM_COMPANION_ERROR', 'The companion service timed out', { reason: 'timeout' });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe('UPSTREAM_COMPANION_ERROR');
  });

  it('replays the stored response for the same Idempotency-Key without a second Nerova session', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const first = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' }, key: 'companion-key-0001' });
    const second = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' }, key: 'companion-key-0001' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(h.nerova.sessionRequests).toHaveLength(1);
  });

  it('rejects the same key with a different body as IDEMPOTENCY_KEY_REUSED', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    await h.call('POST', '/v1/companion/session', { body: { color_mode: 'light' }, key: 'companion-key-0002' });
    const r = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'dark' }, key: 'companion-key-0002' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('requires an Idempotency-Key and a valid colour mode', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const res = await h.app.request('/v1/companion/session', {
      method: 'POST',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ color_mode: 'light' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    const bad = await h.call('POST', '/v1/companion/session', { body: { color_mode: 'sepia' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('lets staff open the companion too (member route, gated by the plan)', async () => {
    const h = plansHarness({ plan: 'growth', accounts: [ready] });
    const r = await h.call('POST', '/v1/companion/session', { token: 'staff', body: { color_mode: 'light' } });
    expect(r.status).toBe(200);
    expect(h.nerova.sessionRequests[0]?.ownerReference).toBe('user_staff');
  });

  it('never exposes the Nerova API key in a success or error response', async () => {
    const ok = plansHarness({ plan: 'growth', accounts: [ready] });
    const cases = [
      await ok.call('POST', '/v1/companion/session', { body: { color_mode: 'light' } }),
      await plansHarness({ plan: 'growth', accounts: [] }).call('POST', '/v1/companion/session', { body: { color_mode: 'light' } }),
      await plansHarness({ plan: 'free' }).call('POST', '/v1/companion/session', { body: { color_mode: 'light' } }),
    ];
    for (const r of cases) expect(r.text).not.toContain(NEROVA_KEY);
    expect(ok.nerova.sessionRequests[0]).not.toHaveProperty('apiKey');
  });
});

describe('sessionIdempotencyKey', () => {
  it('is deterministic per account, owner, minute and mode', () => {
    const at = new Date('2026-10-13T10:00:59.000Z');
    expect(sessionIdempotencyKey('acct_1', 'user_1', at, 'light')).toBe('companion-session-acct_1-user_1-2026-10-13T10:00-light');
    expect(sessionIdempotencyKey('acct_1', 'user_1', new Date('2026-10-13T10:01:00.000Z'), 'light')).not.toBe(
      sessionIdempotencyKey('acct_1', 'user_1', at, 'light'),
    );
  });

  it('stays within Nerova\'s 8 to 128 character limit for very long owner references', () => {
    const key = sessionIdempotencyKey('acct_1540326319194832896', 'u'.repeat(200), new Date('2026-10-13T10:00:00.000Z'), 'dark');
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(128);
  });
});

describe('GET /v1/reports/summary', () => {
  // October 2026, Johannesburg. NOW = Tue 13 Oct 12:00 SAST.
  const appointments = [
    appt('2026-10-05T09:00', { source: 'whatsapp', createdAt: '2026-10-01T08:00:00+02:00' }), // Mon
    appt('2026-10-05T10:00', { source: 'nerova', createdAt: '2026-10-02T08:00:00+02:00' }), // Mon
    appt('2026-10-12T09:00', { source: 'app', priceCents: 40000, createdAt: '2026-10-12T07:00:00+02:00' }), // Mon
    appt('2026-10-08T09:00', { source: 'web', status: 'completed', createdAt: '2026-10-03T08:00:00+02:00' }), // Thu
    appt('2026-10-06T09:00', { status: 'cancelled', createdAt: '2026-10-04T08:00:00+02:00' }),
    appt('2026-10-07T09:00', { status: 'no_show', createdAt: '2026-10-04T08:00:00+02:00' }),
    appt('2026-10-20T09:00', { createdAt: '2026-10-10T08:00:00+02:00' }), // future: created, not completed
    appt('2026-09-30T09:00', { createdAt: '2026-09-29T08:00:00+02:00' }), // September: outside
  ];
  const outcomes = { bookings_created: 12, bookings_rescheduled: 3, bookings_cancelled: 1, conversations_handled: 40 };

  it('combines our numbers with the companion outcomes and usage', async () => {
    const h = plansHarness({ plan: 'growth', appointments, accounts: [ready] });
    h.nerova.outcomes = outcomes;
    const r = await h.call('GET', '/v1/reports/summary');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      month: '2026-10',
      currency: 'ZAR',
      completed_jobs: 4,
      revenue_cents: 25000 * 3 + 40000,
      bookings_created: { whatsapp: 1, companion: 1, manual: 4, web: 1 },
      no_shows: 1,
      cancellations: 1,
      busiest: { weekday: 1, hour: 9 },
      weekly: [
        { week_start: '2026-09-28', completed_jobs: 0 },
        { week_start: '2026-10-05', completed_jobs: 3 },
        { week_start: '2026-10-12', completed_jobs: 1 },
        { week_start: '2026-10-19', completed_jobs: 0 },
        { week_start: '2026-10-26', completed_jobs: 0 },
      ],
      companion: outcomes,
      usage: {
        plan: 'growth',
        month: '2026-10',
        completed_jobs: 4,
        included_jobs: 100,
        usage_percent: 4,
        usage_state: 'normal',
        extra_jobs: 0,
        extra_cost_cents: 0,
        resets_on: '2026-11-01',
      },
    });
  });

  it('keeps working from our own data when Nerova is down: companion is null', async () => {
    const h = plansHarness({ plan: 'growth', appointments, accounts: [ready] });
    h.nerova.failWith = new AppError('UPSTREAM_COMPANION_ERROR', 'timed out', { reason: 'timeout' });
    const r = await h.call('GET', '/v1/reports/summary?month=2026-10');
    expect(r.status).toBe(200);
    expect(r.body.data.companion).toBeNull();
    expect(r.body.data.completed_jobs).toBe(4);
  });

  it('has a null companion when the business has no Nerova account yet', async () => {
    const r = await plansHarness({ plan: 'starter', appointments, accounts: [] }).call('GET', '/v1/reports/summary');
    expect(r.status).toBe(200);
    expect(r.body.data.companion).toBeNull();
  });

  it('reads another month, with nothing in it', async () => {
    const r = await plansHarness({ plan: 'pro', appointments, accounts: [ready] }).call('GET', '/v1/reports/summary?month=2026-08');
    expect(r.body.data).toMatchObject({ month: '2026-08', completed_jobs: 0, revenue_cents: 0, busiest: null, no_shows: 0 });
  });

  it('is 403 FEATURE_NOT_IN_PLAN on Free', async () => {
    const r = await plansHarness({ plan: 'free', appointments }).call('GET', '/v1/reports/summary');
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', details: { feature: 'reports' } });
  });

  it('rejects a malformed month', async () => {
    const r = await plansHarness({ plan: 'growth' }).call('GET', '/v1/reports/summary?month=October');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /v1/billing/usage and GET /v1/plans', () => {
  it('returns the usage envelope for the current month by default', async () => {
    const h = plansHarness({ plan: 'starter', appointments: [appt('2026-10-05T09:00'), appt('2026-10-06T09:00', { status: 'cancelled' })] });
    const r = await h.call('GET', '/v1/billing/usage');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({
      plan: 'starter',
      month: '2026-10',
      completed_jobs: 1,
      included_jobs: 50,
      usage_percent: 2,
      usage_state: 'normal',
      extra_jobs: 0,
      extra_cost_cents: 0,
      resets_on: '2026-11-01',
    });
  });

  it('is available on Free (no allowance) and for a given month', async () => {
    const r = await plansHarness({ plan: 'free', appointments: [appt('2026-09-10T09:00')] }).call('GET', '/v1/billing/usage?month=2026-09');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ plan: 'free', month: '2026-09', completed_jobs: 1, included_jobs: null, usage_percent: null, usage_state: 'normal', resets_on: '2026-10-01' });
  });

  it('reads the default month in the business timezone', async () => {
    const lateUtc = new Date('2026-10-31T22:30:00.000Z');
    const r = await plansHarness({ plan: 'growth', now: lateUtc }).call('GET', '/v1/billing/usage');
    expect(r.body.data.month).toBe('2026-11');
  });

  it('rejects a malformed month', async () => {
    const r = await plansHarness({ plan: 'growth' }).call('GET', '/v1/billing/usage?month=2026-1');
    expect(r.status).toBe(400);
  });

  it('lists the catalogue with the current plan marked and no checkout url', async () => {
    const r = await plansHarness({ plan: 'pro' }).call('GET', '/v1/plans');
    expect(r.status).toBe(200);
    expect(r.body.data.current_plan).toBe('pro');
    expect(r.body.data.plans.map((p: any) => p.id)).toEqual(['free', 'starter', 'growth', 'pro']);
    expect(r.body.data.plans.filter((p: any) => p.is_current).map((p: any) => p.id)).toEqual(['pro']);
    expect(r.body.data.plans.every((p: any) => p.checkout_url === null)).toBe(true);
  });
});
