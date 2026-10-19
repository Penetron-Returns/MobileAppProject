import { Webhook } from 'svix';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PlanKey } from '@booking/types';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { harness, type Harness } from './harness.ts';

const SECRET = `whsec_${Buffer.alloc(32, 9).toString('base64')}`;

let h: Harness;let plan: PlanKey;beforeEach(() => {  plan = 'none';  h = harness({    env: { CLERK_WEBHOOK_SECRET: SECRET },    entitlements: { ...fakeEntitlements('none'), getEntitlements: async () => ({ plan, features: [] }) },  });});

const payload = (over: Record<string, unknown> = {}) => ({
  business: { name: 'Ashgrove Hair & Beauty' },
  owner_name: 'Kobus Krieg',
  hours: [
    { weekday: 1, opens_at: '08:30', closes_at: '17:30' },
    { weekday: 6, opens_at: '08:00', closes_at: '15:00' },
  ],
  services: [
    { name: 'Skin fade', duration_minutes: 30, price_cents: 18_000 },
    { name: 'Beard trim', duration_minutes: 20, price_cents: 9_000 },
  ],
  team: [{ name: 'Naledi', title: 'Stylist' }],
  ...over,
});

const post = (body: unknown, opts: { token?: 'newowner' | 'otherowner' | 'newstaff' | 'noorg' | 'owner' | 'bad' | null; key?: string | null } = {}) =>
  h.call('POST', '/v1/onboarding', { token: opts.token === undefined ? 'newowner' : opts.token, body, ...(opts.key !== undefined ? { key: opts.key } : {}) });

const mine = () => h.repo.tables.businesses.find((b) => b.clerk_org_id === 'org_new');

describe('POST /v1/onboarding', () => {
  it.each([
    [{ timezone: 'America/New_York', currency: 'USD' }, 'America/New_York', 'USD'],
    [{ timezone: 'Europe/London', currency: 'GBP' }, 'Europe/London', 'GBP'],
    [{ timezone: 'Africa/Johannesburg', currency: 'ZAR' }, 'Africa/Johannesburg', 'ZAR'],
    [{}, 'UTC', 'USD'],
  ])('gives the new business the owner locale %j (fallback UTC and USD)', async (locale, timezone, currency) => {
    const res = await post(payload({ business: { name: 'Locale Test', ...locale } }));
    expect(res.status).toBe(200);
    expect(mine()).toMatchObject({ timezone, currency });
  });

  it('rejects an unknown timezone or malformed currency', async () => {
    expect((await post(payload({ business: { name: 'X', timezone: 'Mars/Base' } }))).status).toBe(400);
    expect((await post(payload({ business: { name: 'X', currency: 'dollars' } }))).status).toBe(400);
  });

  it('creates the business, owner user, owner staff, hours, services and team from the verified org', async () => {
    const res = await post(payload());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ role: 'owner', business: { name: 'Ashgrove Hair & Beauty', slug: 'ashgrove-hair-beauty' } });

    const business = mine()!;
    expect(h.repo.tables.users.find((u) => u.id === 'user_new')).toMatchObject({ business_id: business.id, role: 'owner' });
    const staff = h.repo.tables.staff.filter((s) => s.business_id === business.id);
    expect(staff.map((s) => s.name).sort()).toEqual(['Kobus Krieg', 'Naledi']);
    expect(staff.find((s) => s.user_id === 'user_new')).toBeTruthy();
    expect(h.repo.tables.business_hours.filter((r) => r.business_id === business.id)).toHaveLength(2);
    const services = h.repo.tables.services.filter((s) => s.business_id === business.id);
    expect(services.map((s) => s.name)).toEqual(['Skin fade', 'Beard trim']);
    // every bookable staff member can perform every service
    expect(h.repo.tables.staff_services.filter((l) => services.some((s) => s.id === l.service_id))).toHaveLength(4);
  });

  it('replays the same Idempotency-Key and ignores a second run with a new key', async () => {
    const first = await post(payload(), { key: 'onboard-key-0001' });
    const replay = await post(payload(), { key: 'onboard-key-0001' });
    expect(replay.headers.get('idempotent-replay')).toBe('true');
    expect(replay.body).toEqual(first.body);

    const again = await post(payload({ services: [{ name: 'Other', duration_minutes: 10, price_cents: 1 }] }), { key: 'onboard-key-0002' });
    expect(again.status).toBe(200);
    const business = mine()!;
    expect(h.repo.tables.businesses.filter((b) => b.clerk_org_id === 'org_new')).toHaveLength(1);
    expect(h.repo.tables.services.filter((s) => s.business_id === business.id)).toHaveLength(2);
    expect(h.repo.tables.staff.filter((s) => s.business_id === business.id)).toHaveLength(2);
  });

  it('completes a business the Clerk webhook created first, and the late webhook then merges', async () => {
    const id = 'msg_late';
    const event = JSON.stringify({ type: 'organization.created', data: { id: 'org_new', name: 'Ashgrove Hair & Beauty', slug: 'ashgrove-hair-beauty' } });
    const sign = (msgId: string, body: string) => ({
      'content-type': 'application/json',
      'svix-id': msgId,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': new Webhook(SECRET).sign(msgId, new Date(), body),
    });
    await h.app.request('/webhooks/clerk', { method: 'POST', headers: sign('msg_early', event), body: event });
    expect((await post(payload())).status).toBe(200);
    const membership = JSON.stringify({
      type: 'organizationMembership.created',
      data: {
        id: 'mem_1',
        role: 'org:admin',
        organization: { id: 'org_new', name: 'Ashgrove Hair & Beauty', slug: 'ashgrove-hair-beauty' },
        public_user_data: { user_id: 'user_new', identifier: 'kobus@example.com', first_name: 'Kobus', last_name: 'Krieg' },
      },
    });
    const late = await h.app.request('/webhooks/clerk', { method: 'POST', headers: sign(id, membership), body: membership });
    expect(late.status).toBe(200);
    const business = mine()!;
    expect(h.repo.tables.businesses.filter((b) => b.clerk_org_id === 'org_new')).toHaveLength(1);
    expect(h.repo.tables.staff.filter((s) => s.business_id === business.id && s.user_id === 'user_new')).toHaveLength(1);
    expect(h.repo.tables.users.find((u) => u.id === 'user_new')).toMatchObject({ role: 'owner', email: 'kobus@example.com' });
  });

  it('never trusts a client-supplied org id: the org comes from the token', async () => {
    const res = await post({ ...payload(), clerk_org_id: 'org_test', org_id: 'org_test' });
    expect(res.status).toBe(200);
    expect(mine()).toBeTruthy();
    expect(h.business.name).toBe('Salon');
  });

  it.each([
    ['no token', null, 401, 'UNAUTHENTICATED'],
    ['a bad token', 'bad', 401, 'UNAUTHENTICATED'],
    ['a session without an organisation', 'noorg', 403, 'NO_BUSINESS'],
    ['a non-owner member', 'newstaff', 403, 'FORBIDDEN'],
  ] as const)('rejects %s', async (_name, token, status, code) => {
    const res = await post(payload(), { token });
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(mine()).toBeUndefined();
  });

  it('requires an Idempotency-Key', async () => {
    const res = await post(payload(), { key: null });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it.each([
    ['an empty business name', { business: { name: '  ' } }],
    ['no opening hours', { hours: [] }],
    ['hours that close before they open', { hours: [{ weekday: 1, opens_at: '17:00', closes_at: '09:00' }] }],
    ['a negative price', { services: [{ name: 'X', duration_minutes: 30, price_cents: -1 }] }],
    ['a zero-minute service', { services: [{ name: 'X', duration_minutes: 0, price_cents: 0 }] }],
  ])('rejects %s with VALIDATION_FAILED', async (_name, over) => {
    const res = await post(payload(over));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(mine()).toBeUndefined();
  });

  it('lets the team step be skipped and services be empty', async () => {
    const res = await post(payload({ team: [], services: [] }));
    expect(res.status).toBe(200);
    expect(h.repo.tables.staff.filter((s) => s.business_id === mine()!.id)).toHaveLength(1);
  });
});

describe('onboarding atomicity', () => {
  const countsFor = (businessId: string) => ({
    staff: h.repo.tables.staff.filter((s) => s.business_id === businessId).length,
    services: h.repo.tables.services.filter((s) => s.business_id === businessId).length,
    hours: h.repo.tables.business_hours.filter((r) => r.business_id === businessId).length,
  });

  it('retry after a failed attempt completes the setup instead of leaving it half done', async () => {
    const original = h.repo.completeOnboarding;
    h.repo.completeOnboarding = async () => {
      throw new Error('connection lost');
    };
    const failed = await post(payload());
    expect(failed.status).toBeGreaterThanOrEqual(500);
    h.repo.completeOnboarding = original;

    const retry = await post(payload(), { key: 'onboard-retry-0001' });
    expect(retry.status).toBe(200);
    expect(countsFor(mine()!.id)).toEqual({ staff: 2, services: 2, hours: 2 });
  });

  it('applies nothing when any part of the setup is invalid, then completes on a valid retry', async () => {
    const fresh = { ...h.business, id: h.repo.nextId(), clerk_org_id: 'org_fresh', slug: 'fresh' };
    h.repo.tables.businesses.push(fresh);
    const input = {
      businessId: fresh.id,
      userId: 'user_fresh',
      ownerName: 'Fresh Owner',
      hours: [{ weekday: 2, opens_at: '09:00', closes_at: '10:00' }],
      team: [{ name: 'Extra', title: null }],
      services: [{ name: 'Bad', duration_minutes: 0, price_cents: 0 }],
    };
    await expect(h.repo.completeOnboarding(input)).rejects.toThrow();
    expect(countsFor(fresh.id)).toEqual({ staff: 0, services: 0, hours: 0 });

    const valid = { ...input, services: [{ name: 'Good', duration_minutes: 30, price_cents: 1 }] };
    expect(await h.repo.completeOnboarding(valid)).toBe(true);
    expect(countsFor(fresh.id)).toEqual({ staff: 2, services: 1, hours: 1 });
    // marker written: a second call is a no-op
    expect(await h.repo.completeOnboarding({ ...valid, services: [{ name: 'Again', duration_minutes: 30, price_cents: 1 }] })).toBe(false);
    expect(countsFor(fresh.id)).toEqual({ staff: 2, services: 1, hours: 1 });
  });

  it('a concurrent double submit with different keys does not duplicate staff or services', async () => {
    const [a, b] = await Promise.all([post(payload(), { key: 'onboard-race-0001' }), post(payload(), { key: 'onboard-race-0002' })]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(h.repo.tables.businesses.filter((x) => x.clerk_org_id === 'org_new')).toHaveLength(1);
    expect(countsFor(mine()!.id)).toEqual({ staff: 2, services: 2, hours: 2 });
    expect(h.repo.tables.staff.filter((s) => s.user_id === 'user_new')).toHaveLength(1);
  });
});

describe('onboarding idempotency scope', () => {
  it('does not replay one organisation\'s response to another that reuses the same key', async () => {
    const first = await post(payload(), { token: 'newowner', key: 'shared-key-0001' });
    const second = await post(payload({ business: { name: 'Other Salon' } }), { token: 'otherowner', key: 'shared-key-0001' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get('idempotent-replay')).toBeNull();
    expect(second.body.data.business.name).toBe('Other Salon');
    expect(h.repo.tables.businesses.some((b) => b.clerk_org_id === 'org_other')).toBe(true);
    // each caller still replays its own response
    const again = await post(payload(), { token: 'newowner', key: 'shared-key-0001' });
    expect(again.headers.get('idempotent-replay')).toBe('true');
    expect(again.body).toEqual(first.body);
  });
});

describe('POST /v1/onboarding revise (owner went back from the plan screen)', () => {
  const revised = (over: Record<string, unknown> = {}) =>
    payload({
      business: { name: 'Fresh Cuts' },
      hours: [{ weekday: 2, opens_at: '08:00', closes_at: '18:00' }],
      services: [{ name: 'Gel manicure', duration_minutes: 45, price_cents: 28_000 }],
      revise: true,
      ...over,
    });
  const names = () => h.repo.tables.services.filter((s) => s.business_id === mine()!.id).map((s) => s.name);

  it('renames and re-applies the new template without a second business', async () => {
    await post(payload());
    const res = await post(revised(), { key: 'onboard-revise-0001' });
    expect(res.status).toBe(200);
    expect(res.body.data.business.name).toBe('Fresh Cuts');
    expect(h.repo.tables.businesses.filter((b) => b.clerk_org_id === 'org_new')).toHaveLength(1);
    expect(names()).toEqual(['Gel manicure']);
    expect(h.repo.tables.business_hours.filter((r) => r.business_id === mine()!.id).map((r) => r.weekday)).toEqual([2]);
    // the new service is bookable by the owner and every existing staff member
    const svc = h.repo.tables.services.find((s) => s.business_id === mine()!.id)!;
    expect(h.repo.tables.staff_services.filter((l) => l.service_id === svc.id)).toHaveLength(2);
  });

  it('is repeatable: the same revision twice leaves one copy of each service', async () => {
    await post(payload());
    await post(revised(), { key: 'onboard-revise-0001' });
    await post(revised(), { key: 'onboard-revise-0002' });
    expect(names()).toEqual(['Gel manicure']);
  });

  it('changes only the name when the template is unchanged', async () => {
    await post(payload());
    const before = names();
    const res = await post(payload({ business: { name: 'Only Renamed' }, revise: true }), { key: 'onboard-revise-0003' });
    expect(res.body.data.business.name).toBe('Only Renamed');
    expect(names()).toEqual(before);
  });

  it('keeps the old setup once the business has a paid plan', async () => {
    await post(payload());
    plan = 'starter';
    const res = await post(revised(), { key: 'onboard-revise-0004' });
    expect(res.status).toBe(200);
    expect(res.body.data.business.name).toBe('Ashgrove Hair & Beauty');
    expect(names()).toEqual(['Skin fade', 'Beard trim']);
  });

  it('keeps the old setup once the business has an appointment', async () => {
    await post(payload());
    h.repo.tables.appointments.push({ business_id: mine()!.id } as never);
    const res = await post(revised(), { key: 'onboard-revise-0005' });
    expect(res.body.data.business.name).toBe('Ashgrove Hair & Beauty');
    expect(names()).toEqual(['Skin fade', 'Beard trim']);
  });

  it('ignores a revision unless it is asked for', async () => {
    await post(payload());
    await post(revised({ revise: undefined }), { key: 'onboard-revise-0006' });
    expect(names()).toEqual(['Skin fade', 'Beard trim']);
  });
});
