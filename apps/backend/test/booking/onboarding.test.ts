import { Webhook } from 'svix';
import { beforeEach, describe, expect, it } from 'vitest';

import { harness, type Harness } from './harness.ts';

const SECRET = `whsec_${Buffer.alloc(32, 9).toString('base64')}`;

let h: Harness;
beforeEach(() => {
  h = harness({ env: { CLERK_WEBHOOK_SECRET: SECRET } });
});

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

const post = (body: unknown, opts: { token?: 'newowner' | 'newstaff' | 'noorg' | 'owner' | 'bad' | null; key?: string | null } = {}) =>
  h.call('POST', '/v1/onboarding', { token: opts.token === undefined ? 'newowner' : opts.token, body, ...(opts.key !== undefined ? { key: opts.key } : {}) });

const mine = () => h.repo.tables.businesses.find((b) => b.clerk_org_id === 'org_new');

describe('POST /v1/onboarding', () => {
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
