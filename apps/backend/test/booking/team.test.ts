import { beforeEach, describe, expect, it } from 'vitest';

import { handleClerkEvent } from '../../src/booking/clerkSync.ts';
import { AppError } from '../../src/lib/errors.ts';
import { harness, type Harness } from './harness.ts';

const ORG = 'org_test';
const UNKNOWN_UUID = '00000000-0000-4000-8000-0000000fffff';
let h: Harness;

beforeEach(() => {
  h = harness();
  h.clerk.addMember(ORG, { userId: 'user_owner', role: 'owner', email: 'owner@example.com', name: 'Olive Owner' });
  h.clerk.addMember(ORG, { userId: 'user_staff', role: 'staff', email: 'staff@example.com', name: 'Sam Staff' });
  h.thandi.user_id = 'user_staff';
});

const invite = (body: unknown, key?: string) =>
  h.call('POST', '/v1/team/invitations', { body, ...(key ? { key } : {}) });

describe('team routes: authorisation', () => {
  it('answers 403 FORBIDDEN to a staff-role caller on every team route', async () => {
    const routes = [
      ['GET', '/v1/team', undefined],
      ['POST', '/v1/team/invitations', { email: 'x@example.com', role: 'staff' }],
      ['DELETE', '/v1/team/invitations/orginv_1', undefined],
      ['PATCH', '/v1/team/members/user_owner', { role: 'staff' }],
      ['DELETE', '/v1/team/members/user_owner', undefined],
    ] as const;
    for (const [method, path, body] of routes) {
      const res = await h.call(method, path, { token: 'staff', body });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(h.clerk.calls).toEqual([]);
  });

  it('uses the organisation from the token, never from the request', async () => {
    h.clerk.addMember('org_other', { userId: 'user_x', role: 'owner', email: 'x@example.com' });
    const res = await h.call('GET', '/v1/team?org=org_other');
    expect(res.body.data.members.map((m: { user_id: string }) => m.user_id).sort()).toEqual(['user_owner', 'user_staff']);
  });
});

describe('GET /v1/team', () => {
  it('lists members with role, linked staff and is_self, plus pending invitations', async () => {
    await invite({ email: 'new@example.com', role: 'staff', staff_id: h.sipho.id });
    const res = await h.call('GET', '/v1/team');
    expect(res.status).toBe(200);
    expect(res.body.data.members).toEqual([
      // the owner's own staff row was created when they first called the API
      { user_id: 'user_owner', name: 'Olive Owner', email: 'owner@example.com', role: 'owner', staff_id: expect.any(String), is_self: true },
      { user_id: 'user_staff', name: 'Sam Staff', email: 'staff@example.com', role: 'staff', staff_id: h.thandi.id, is_self: false },
    ]);
    expect(res.body.data.invitations).toEqual([
      { id: 'orginv_1', email: 'new@example.com', role: 'staff', staff_id: h.sipho.id, created_at: expect.any(String) },
    ]);
  });
});

describe('POST /v1/team/invitations', () => {
  it('creates a Clerk invitation carrying staff_id, fills a blank staff email and audits it', async () => {
    const res = await invite({ email: ' New@Example.com ', role: 'staff', staff_id: h.sipho.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'new@example.com', role: 'staff', staff_id: h.sipho.id });
    expect(h.clerk.invitations.get(ORG)).toHaveLength(1);
    expect(h.sipho.email).toBe('new@example.com');
    expect(h.repo.tables.audit_events).toEqual([
      expect.objectContaining({
        businessId: h.business.id,
        actorId: 'user_owner',
        action: 'insert',
        entity: 'team_invitation',
        entityId: 'orginv_1',
        diff: { role: 'staff', staff_id: h.sipho.id },
      }),
    ]);
  });

  it('keeps an existing staff email', async () => {
    h.sipho.email = 'sipho@salon.test';
    await invite({ email: 'other@example.com', role: 'staff', staff_id: h.sipho.id });
    expect(h.sipho.email).toBe('sipho@salon.test');
  });

  it('replays the stored response for a repeated Idempotency-Key without a second invitation', async () => {
    const first = await invite({ email: 'new@example.com', role: 'owner' }, 'invite-key-0001');
    const again = await invite({ email: 'new@example.com', role: 'owner' }, 'invite-key-0001');
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(h.clerk.invitations.get(ORG)).toHaveLength(1);
    expect(h.repo.tables.audit_events).toHaveLength(1);
  });

  it('rejects an email that is already a member', async () => {
    const res = await invite({ email: 'STAFF@example.com', role: 'staff' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { rule: 'ALREADY_MEMBER' } });
  });

  it('rejects a staff row that already has a login', async () => {
    const res = await invite({ email: 'x@example.com', role: 'staff', staff_id: h.thandi.id });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { rule: 'STAFF_ALREADY_LINKED' } });
  });

  it('rejects a second invitation to the same email under a new key', async () => {
    await invite({ email: 'new@example.com', role: 'staff' });
    const res = await invite({ email: 'NEW@example.com', role: 'owner' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.rule).toBe('ALREADY_INVITED');
  });

  it('validates the body and the staff reference', async () => {
    expect((await invite({ email: 'not-an-email', role: 'staff' })).status).toBe(400);
    expect((await invite({ email: 'a@example.com', role: 'admin' })).status).toBe(400);
    expect((await invite({ email: 'a@example.com', role: 'staff', staff_id: UNKNOWN_UUID })).status).toBe(404);
    expect(h.clerk.invitations.get(ORG) ?? []).toHaveLength(0);
  });

  it('surfaces a Clerk outage as 500', async () => {
    h.clerk.failWith = new AppError('INTERNAL', 'Team service unavailable', { upstream: 'clerk' });
    expect((await invite({ email: 'a@example.com', role: 'staff' })).status).toBe(500);
  });
});

describe('DELETE /v1/team/invitations/:id', () => {
  it('revokes a pending invitation and audits it', async () => {
    await invite({ email: 'new@example.com', role: 'staff' });
    const res = await h.call('DELETE', '/v1/team/invitations/orginv_1');
    expect(res.body.data).toEqual({ id: 'orginv_1', revoked: true });
    expect(h.clerk.invitations.get(ORG)).toHaveLength(0);
    expect(h.repo.tables.audit_events.at(-1)).toMatchObject({ action: 'delete', entity: 'team_invitation', entityId: 'orginv_1' });
    expect((await h.call('DELETE', '/v1/team/invitations/orginv_1')).status).toBe(404);
  });
});

describe('PATCH /v1/team/members/:userId', () => {
  it('changes the role in Clerk and in users, and audits the change', async () => {
    h.repo.tables.users.push({ id: 'user_staff', business_id: h.business.id, role: 'staff', email: null, display_name: null, avatar_url: null });
    const res = await h.call('PATCH', '/v1/team/members/user_staff', { body: { role: 'owner' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ user_id: 'user_staff', role: 'owner', staff_id: h.thandi.id });
    expect(h.clerk.members.get(ORG)!.find((m) => m.userId === 'user_staff')!.role).toBe('owner');
    expect(h.repo.tables.users.find((u) => u.id === 'user_staff')!.role).toBe('owner');
    expect(h.repo.tables.audit_events.at(-1)).toMatchObject({
      action: 'update',
      entity: 'team_member',
      diff: { role: { old: 'staff', new: 'owner' } },
    });
  });

  it('never demotes the last owner', async () => {
    const res = await h.call('PATCH', '/v1/team/members/user_owner', { body: { role: 'staff' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { rule: 'LAST_OWNER' } });
    expect(h.clerk.members.get(ORG)!.find((m) => m.userId === 'user_owner')!.role).toBe('owner');
  });

  it('lets an owner step down once another owner exists', async () => {
    h.clerk.addMember(ORG, { userId: 'user_owner2', role: 'owner', email: 'o2@example.com' });
    const res = await h.call('PATCH', '/v1/team/members/user_owner', { body: { role: 'staff' } });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('staff');
  });

  it('answers 404 outside the organisation and is a no-op for an unchanged role', async () => {
    expect((await h.call('PATCH', '/v1/team/members/user_nobody', { body: { role: 'staff' } })).status).toBe(404);
    const same = await h.call('PATCH', '/v1/team/members/user_staff', { body: { role: 'staff' } });
    expect(same.status).toBe(200);
    expect(h.repo.tables.audit_events).toHaveLength(0);
  });
});

describe('DELETE /v1/team/members/:userId', () => {
  it('removes the login, detaches the user and unlinks (not deletes) the staff row', async () => {
    h.repo.tables.users.push({ id: 'user_staff', business_id: h.business.id, role: 'staff', email: null, display_name: null, avatar_url: null });
    const res = await h.call('DELETE', '/v1/team/members/user_staff');
    expect(res.body.data).toEqual({ user_id: 'user_staff', removed: true });
    expect(h.clerk.members.get(ORG)!.map((m) => m.userId)).toEqual(['user_owner']);
    expect(h.repo.tables.users.find((u) => u.id === 'user_staff')!.business_id).toBeNull();
    expect(h.repo.tables.staff.find((s) => s.id === h.thandi.id)!.user_id).toBeNull();
    expect(h.repo.tables.audit_events.at(-1)).toMatchObject({ action: 'delete', entity: 'team_member', entityId: 'user_staff' });
  });

  it('never removes the last owner', async () => {
    const res = await h.call('DELETE', '/v1/team/members/user_owner');
    expect(res.status).toBe(422);
    expect(res.body.error.details.rule).toBe('LAST_OWNER');
    expect(h.clerk.members.get(ORG)).toHaveLength(2);
  });
});

describe('linking a login on first authed call (no webhook)', () => {
  const join = (m: { staffId?: string | null; email?: string | null; name?: string | null }) =>
    h.clerk.addMember(ORG, { userId: 'user_invitee', role: 'staff', email: m.email ?? null, name: m.name ?? null, staffId: m.staffId ?? null });
  const staffOf = () => h.repo.tables.staff.filter((s) => s.user_id === 'user_invitee');

  it('links the staff row named by the invitation metadata first', async () => {
    h.sipho.email = 'sipho@example.com';
    join({ staffId: h.off.id, email: 'sipho@example.com', name: 'Invited Person' });
    const res = await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('staff');
    expect(staffOf().map((s) => s.id)).toEqual([h.off.id]);
    expect(h.sipho.user_id).toBeNull();
  });

  it('falls back to an unlinked active staff row with the same email, ignoring case', async () => {
    h.sipho.email = 'Sipho@Example.com';
    join({ email: 'sipho@EXAMPLE.com', name: 'Sipho M' });
    await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(staffOf().map((s) => s.id)).toEqual([h.sipho.id]);
  });

  it('skips inactive or linked email matches and creates a staff row named from Clerk', async () => {
    h.thandi.email = 'lee@example.com'; // already linked to user_staff
    h.sipho.email = 'lee@example.com';
    h.sipho.is_active = false;
    join({ email: 'lee@example.com', name: 'Lee Mokoena' });
    const before = h.repo.tables.staff.length;
    await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(h.repo.tables.staff).toHaveLength(before + 1);
    expect(staffOf()[0]).toMatchObject({ name: 'Lee Mokoena', email: 'lee@example.com', is_active: true });
    expect(h.sipho.user_id).toBeNull();
  });

  it('ignores a metadata staff row that already has a login', async () => {
    join({ staffId: h.thandi.id, email: 'new@example.com', name: 'New Person' });
    await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(h.thandi.user_id).toBe('user_staff');
    expect(staffOf()[0]!.name).toBe('New Person');
  });

  it('ignores malformed metadata', async () => {
    join({ staffId: 'not-a-uuid', email: 'new@example.com', name: 'New Person' });
    const res = await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(res.status).toBe(200);
    expect(staffOf()).toHaveLength(1);
  });

  it('is idempotent across calls', async () => {
    join({ email: 'new@example.com', name: 'New Person' });
    await h.call('GET', '/v1/me', { token: 'invitee' });
    await h.call('POST', '/v1/clients', { token: 'invitee', body: { phone: '0831112222' } });
    await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(staffOf()).toHaveLength(1);
  });

  it('mirrors the role from the verified token onto users', async () => {
    join({ email: 'new@example.com', name: 'New Person' });
    await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(h.repo.tables.users.find((u) => u.id === 'user_invitee')).toMatchObject({
      business_id: h.business.id,
      role: 'staff',
      email: 'new@example.com',
    });
    await h.call('GET', '/v1/me', { token: 'owner2' });
    expect(h.repo.tables.users.find((u) => u.id === 'user_owner2')).toMatchObject({ role: 'owner' });
  });

  it('still serves the request when Clerk is down, creating no placeholder staff row', async () => {
    h.clerk.failWith = new AppError('INTERNAL', 'down');
    const before = h.repo.tables.staff.length;
    const res = await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(res.status).toBe(200);
    expect(h.repo.tables.staff).toHaveLength(before);
    expect(h.repo.tables.users.find((u) => u.id === 'user_invitee')).toMatchObject({ business_id: h.business.id, role: 'staff' });
  });

  it('applies the same linking order in the Clerk webhook', async () => {
    const event = (staffId: string | null) => ({
      type: 'organizationMembership.created',
      data: {
        role: 'org:member',
        public_metadata: staffId ? { staff_id: staffId } : {},
        organization: { id: ORG, name: 'Salon' },
        public_user_data: { user_id: 'user_hook', identifier: 'hook@example.com', first_name: 'Hook', last_name: 'User' },
      },
    });
    await handleClerkEvent(h.repo, event(h.off.id));
    expect(h.off.user_id).toBe('user_hook');
    expect(h.off.email).toBe('hook@example.com');
    await handleClerkEvent(h.repo, event(h.sipho.id));
    expect(h.sipho.user_id).toBeNull();
  });
});

describe('staff-role member end to end', () => {
  it('can use the app but holds no owner powers', async () => {
    h.clerk.addMember(ORG, { userId: 'user_invitee', role: 'staff', email: 'i@example.com', name: 'Invited' });
    const me = await h.call('GET', '/v1/me', { token: 'invitee' });
    expect(me.body.data.role).toBe('staff');
    const days = await h.call('GET', `/v1/availability/days?service_id=${h.cut.id}&from=2026-09-30&to=2026-10-02`, { token: 'invitee' });
    expect(days.status).toBe(200);
    expect((await h.call('POST', '/v1/clients', { token: 'invitee', body: { phone: '0831112222' } })).status).toBe(201);

    const ownerOnly = [
      ['PATCH', '/v1/business', { name: 'X' }],
      ['PUT', '/v1/business/hours', { hours: [] }],
      ['POST', '/v1/services', { name: 'X', duration_minutes: 30, price_cents: 0 }],
      ['PATCH', `/v1/services/${h.cut.id}`, { name: 'X' }],
      ['DELETE', `/v1/services/${h.cut.id}`, undefined],
      ['POST', '/v1/staff', { name: 'X' }],
      ['PATCH', `/v1/staff/${h.sipho.id}`, { name: 'X' }],
      ['DELETE', `/v1/staff/${h.sipho.id}`, undefined],
      ['PUT', `/v1/staff/${h.sipho.id}/services`, { service_ids: [] }],
      ['PUT', `/v1/staff/${h.sipho.id}/availability`, { rules: [] }],
      ['POST', '/v1/overrides', { date: '2026-09-30', is_closed: true }],
      ['DELETE', `/v1/overrides/${UNKNOWN_UUID}`, undefined],
      ['POST', '/v1/whatsapp/connect', { waba_id: 'w', phone_number_id: 'p', access_token: 't' }],
      ['POST', '/v1/whatsapp/sync', {}],
      ['POST', '/v1/whatsapp/disconnect', {}],
      ['POST', '/v1/whatsapp/test-message', { to: '0831112222' }],
      ['POST', '/v1/whatsapp/embedded-signup', { code: 'c', waba_id: 'w', phone_number_id: 'p' }],
      ['GET', '/v1/team', undefined],
    ] as const;
    for (const [method, path, body] of ownerOnly) {
      const res = await h.call(method, path, { token: 'invitee', body });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});
