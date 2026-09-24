import { Webhook } from 'svix';
import { beforeEach, describe, expect, it } from 'vitest';

import { slugify } from '../../src/booking/clerkSync';
import { runCleanupJob } from '../../src/booking/jobs';
import { testContainer } from '../helpers';
import { NOW } from './fixtures';
import { harness, type Harness } from './harness';

const SECRET = `whsec_${Buffer.alloc(32, 9).toString('base64')}`;

let h: Harness;
let seq = 0;
beforeEach(() => {
  h = harness({ env: { CLERK_WEBHOOK_SECRET: SECRET } });
});

async function deliver(event: unknown, opts: { id?: string; secret?: string; tamper?: boolean } = {}) {
  seq += 1;
  const id = opts.id ?? `msg_${seq}`;
  const payload = JSON.stringify(event);
  const signature = new Webhook(opts.secret ?? SECRET).sign(id, new Date(), payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await h.app.request('/webhooks/clerk', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature },
    body: opts.tamper ? payload.replace('Acme', 'Evil') : payload,
  });
  return { status: res.status, body: (await res.json()) as any };
}

const org = (id: string, name: string, slug: string | null = null) => ({ type: 'organization.created', data: { id, name, slug } });
const membership = (type: string, orgId: string, userId: string, role = 'org:member') => ({
  type,
  data: {
    id: `mem_${userId}`,
    role,
    organization: { id: orgId, name: 'Acme Hair', slug: 'acme-hair' },
    public_user_data: { user_id: userId, identifier: 'lee@example.com', first_name: 'Lee', last_name: 'Mokoena', image_url: null },
  },
});

describe('Clerk webhook', () => {
  it('rejects bad or missing signatures with 400', async () => {
    expect((await deliver(org('org_1', 'Acme'), { secret: `whsec_${Buffer.alloc(32, 1).toString('base64')}` })).status).toBe(400);
    expect((await deliver(org('org_1', 'Acme'), { tamper: true })).status).toBe(400);
    const unsigned = await h.app.request('/webhooks/clerk', { method: 'POST', body: '{}' });
    expect(unsigned.status).toBe(400);
    expect(h.repo.tables.businesses.some((b) => b.clerk_org_id === 'org_1')).toBe(false);
  });

  it('mirrors organisations with unique slugs and dedupes deliveries', async () => {
    const res = await deliver(org('org_1', 'Acme Hair & Beauty'), { id: 'msg_dup' });
    expect(res).toEqual({ status: 200, body: { data: { status: 'handled' } } });
    const acme = h.repo.tables.businesses.find((b) => b.clerk_org_id === 'org_1')!;
    expect(acme).toMatchObject({ name: 'Acme Hair & Beauty', slug: 'acme-hair-beauty', timezone: 'Africa/Johannesburg' });

    const dup = await deliver(org('org_1', 'Renamed'), { id: 'msg_dup' });
    expect(dup.body.data.status).toBe('duplicate');
    expect(acme.name).toBe('Acme Hair & Beauty');
    expect(h.repo.tables.webhook_events.find((e) => e.event_key === 'msg_dup')).toMatchObject({
      source: 'clerk',
      payload: { type: 'organization.created', object_id: 'org_1' },
      attempts: 1,
    });

    await deliver(org('org_2', 'Salon'));
    expect(h.repo.tables.businesses.find((b) => b.clerk_org_id === 'org_2')!.slug).toBe('salon-2');

    await deliver({ type: 'organization.updated', data: { id: 'org_1', name: 'Acme', slug: 'acme' } });
    expect(acme).toMatchObject({ name: 'Acme', slug: 'acme' });

    await deliver({ type: 'organization.deleted', data: { id: 'org_2', deleted: true } });
    expect(h.repo.tables.businesses.some((b) => b.clerk_org_id === 'org_2')).toBe(false);
  });

  it('mirrors users and memberships (creating the business and a staff row)', async () => {
    await deliver({
      type: 'user.created',
      data: {
        id: 'user_lee',
        first_name: 'Lee',
        last_name: 'Mokoena',
        image_url: 'https://img/lee.png',
        primary_email_address_id: 'e2',
        email_addresses: [
          { id: 'e1', email_address: 'old@example.com' },
          { id: 'e2', email_address: 'lee@example.com' },
        ],
      },
    });
    expect(h.repo.tables.users).toContainEqual({
      id: 'user_lee',
      business_id: null,
      role: 'staff',
      email: 'lee@example.com',
      display_name: 'Lee Mokoena',
      avatar_url: 'https://img/lee.png',
    });

    // membership arrives before organization.created
    await deliver(membership('organizationMembership.created', 'org_new', 'user_lee', 'org:admin'));
    const business = h.repo.tables.businesses.find((b) => b.clerk_org_id === 'org_new')!;
    expect(business.slug).toBe('acme-hair');
    expect(h.repo.tables.users.find((u) => u.id === 'user_lee')).toMatchObject({ business_id: business.id, role: 'owner' });
    const staff = h.repo.tables.staff.filter((s) => s.user_id === 'user_lee');
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({ business_id: business.id, name: 'Lee Mokoena', email: 'lee@example.com', is_active: true });

    await deliver(membership('organizationMembership.created', 'org_new', 'user_lee'));
    expect(h.repo.tables.staff.filter((s) => s.user_id === 'user_lee')).toHaveLength(1);

    await deliver(membership('organizationMembership.updated', 'org_new', 'user_lee', 'org:member'));
    expect(h.repo.tables.users.find((u) => u.id === 'user_lee')!.role).toBe('staff');

    await deliver(membership('organizationMembership.deleted', 'org_new', 'user_lee'));
    expect(h.repo.tables.users.find((u) => u.id === 'user_lee')!.business_id).toBeNull();
    expect(h.repo.tables.staff.find((s) => s.id === staff[0]!.id)!.user_id).toBeNull();

    await deliver({ type: 'user.deleted', data: { id: 'user_lee', deleted: true } });
    expect(h.repo.tables.users.some((u) => u.id === 'user_lee')).toBe(false);
  });

  it('acknowledges unhandled event types', async () => {
    const res = await deliver({ type: 'session.created', data: { id: 'sess_1' } });
    expect(res).toEqual({ status: 200, body: { data: { status: 'ignored' } } });
  });

  it('slugifies names', () => {
    expect(slugify('  Café Olé -- Braids!  ')).toBe('cafe-ole-braids');
    expect(slugify('***')).toBe('business');
    expect(slugify('x'.repeat(100))).toHaveLength(60);
  });
});

describe('runCleanupJob', () => {
  const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

  it('expires keys, prunes processed webhook events and abandons stale web attempts', async () => {
    const t = h.repo.tables;
    t.idempotency_keys.push({ key: 'old', expires_at: ago(1) }, { key: 'fresh', expires_at: ago(-60) });
    const event = (id: string, processed_at: string | null, received_at = ago(60 * 24 * 40)) => ({
      id,
      source: 'clerk',
      event_key: id,
      payload: {},
      received_at,
      processed_at,
      error: null,
      attempts: 1,
    });
    t.webhook_events.push(event('e_old', ago(60 * 24 * 31)), event('e_recent', ago(60 * 24 * 10)), event('e_unprocessed', null));
    const attempt = (id: string, channel: 'web' | 'whatsapp', started: number, outcome: 'in_progress' | 'completed' = 'in_progress') => ({
      id,
      business_id: h.business.id,
      channel,
      client_id: null,
      conversation_id: null,
      session_key: null,
      started_at: ago(started),
      completed_at: null,
      step_count: 0,
      outcome,
      appointment_id: null,
      error_code: null,
      steps: [],
    });
    t.booking_attempts.push(
      attempt('a_stale', 'web', 121),
      attempt('a_live', 'web', 60),
      attempt('a_wa', 'whatsapp', 600),
      attempt('a_done', 'web', 600, 'completed'),
    );

    const container = { ...testContainer(), bookingRepository: h.repo };
    const result = await runCleanupJob(container, NOW);
    expect(result).toEqual({ failed_steps: 0, idempotency_keys_deleted: 1, webhook_events_pruned: 1, attempts_abandoned: 1 });
    expect(t.idempotency_keys.map((k) => k.key)).toEqual(['fresh']);
    expect(t.webhook_events.map((e) => e.id)).toEqual(['e_recent', 'e_unprocessed']);
    expect(Object.fromEntries(t.booking_attempts.map((a) => [a.id, a.outcome]))).toEqual({
      a_stale: 'abandoned',
      a_live: 'in_progress',
      a_wa: 'in_progress',
      a_done: 'completed',
    });
  });

  it('keeps going when a step fails', async () => {
    const repo = { ...h.repo, deleteExpiredIdempotencyKeys: async () => Promise.reject(new Error('db down')) };
    const result = await runCleanupJob({ ...testContainer(), bookingRepository: repo } as never, NOW);
    expect(result).toEqual({ failed_steps: 1, idempotency_keys_deleted: 0, webhook_events_pruned: 0, attempts_abandoned: 0 });
  });
});
