import { beforeEach, describe, expect, it } from 'vitest';

import { AppError } from '@booking/features/lib/errors.ts';
import { handleClerkEvent } from '@booking/features/team/services/clerkSync.ts';
import { FORMER_STAFF_NAME } from '@booking/features/team/services/account.ts';
import { harness, type Harness } from './harness.ts';

const ORG = 'org_test';
let h: Harness;

beforeEach(() => {
  h = harness();
  h.clerk.addMember(ORG, { userId: 'user_owner', role: 'owner', email: 'owner@example.com', name: 'Olive Owner' });
  h.clerk.addMember(ORG, { userId: 'user_staff', role: 'staff', email: 'staff@example.com', name: 'Sam Staff' });
  h.thandi.user_id = 'user_staff';
  h.thandi.email = 'thandi@salon.test';
  h.thandi.phone = '+27820000000';
  h.repo.tables.users.push({ id: 'user_staff', business_id: h.business.id, role: 'staff', email: 'staff@example.com', display_name: 'Sam Staff', avatar_url: null });
});

const remove = (token: 'owner' | 'staff', body?: unknown, key?: string) =>
  h.call('DELETE', '/v1/me', { token, ...(body === undefined ? {} : { body }), ...(key ? { key } : {}) });

describe('GET /v1/me/deletion-preview', () => {
  it('tells a staff member that only their own login goes', async () => {
    const res = await h.call('GET', '/v1/me/deletion-preview', { token: 'staff' });
    expect(res.body.data).toEqual({ business_deleted: false, business_name: h.business.name, other_member_count: 1 });
  });

  it('tells the only owner that the business goes too', async () => {
    const res = await h.call('GET', '/v1/me/deletion-preview');
    expect(res.body.data).toEqual({ business_deleted: true, business_name: h.business.name, other_member_count: 1 });
  });

  it('does not treat an owner as the sole owner while another owner exists', async () => {
    h.clerk.addMember(ORG, { userId: 'user_owner2', role: 'owner' });
    expect((await h.call('GET', '/v1/me/deletion-preview')).body.data.business_deleted).toBe(false);
  });
});

describe('DELETE /v1/me as a staff member', () => {
  it('deletes the Clerk user, revokes push tokens at once, anonymises the staff row and leaves the rest to the user.deleted webhook', async () => {
    h.repo.tables.device_push_tokens.push({ business_id: h.business.id, user_id: 'user_staff', token: 'ExponentPushToken[x]', platform: 'android' });

    const res = await remove('staff');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true, business_deleted: false });
    expect(h.repo.tables.device_push_tokens).toEqual([]);
    expect(h.repo.tables.users.some((u) => u.id === 'user_staff')).toBe(true); // the webhook removes it
    await handleClerkEvent(h.repo, { type: 'user.deleted', data: { id: 'user_staff' } });

    expect(h.clerk.deletedUsers).toEqual(['user_staff']);
    expect(h.clerk.deletedOrganizations).toEqual([]);
    expect(h.repo.tables.users.some((u) => u.id === 'user_staff')).toBe(false);
    expect(h.repo.tables.staff.find((s) => s.id === h.thandi.id)).toMatchObject({
      user_id: null,
      name: FORMER_STAFF_NAME,
      email: null,
      phone: null,
      photo_url: null,
      is_active: false,
      accepts_bookings: false,
    });
    expect(h.repo.tables.businesses.some((b) => b.id === h.business.id)).toBe(true);
    expect(h.repo.tables.audit_events.at(-1)).toMatchObject({
      businessId: h.business.id,
      actorId: 'user_staff',
      action: 'delete',
      entity: 'account',
      entityId: 'user_staff',
      diff: { role: 'staff', business_deleted: false },
    });
  });

  it('needs no business name', async () => {
    expect((await remove('staff', {})).status).toBe(200);
  });

  it('replays the stored response for a repeated Idempotency-Key', async () => {
    const first = await remove('staff', undefined, 'delete-key-0001');
    const again = await remove('staff', undefined, 'delete-key-0001');
    expect(again.body).toEqual(first.body);
    expect(h.clerk.deletedUsers).toEqual(['user_staff']);
    expect(h.repo.tables.audit_events.filter((e) => e.entity === 'account')).toHaveLength(1);
  });

  it('requires an Idempotency-Key', async () => {
    const res = await h.call('DELETE', '/v1/me', { token: 'staff', key: null });
    expect(res.status).toBe(400);
    expect(h.clerk.deletedUsers).toEqual([]);
  });

  it('rejects a bad token and a device voice token', async () => {
    expect((await h.call('DELETE', '/v1/me', { token: 'bad' })).status).toBe(401);
    expect((await h.call('DELETE', '/v1/me', { token: null, headers: { authorization: 'Bearer cvt_abc' } })).status).toBe(401);
    expect(h.clerk.deletedUsers).toEqual([]);
  });
});

describe('DELETE /v1/me as an owner', () => {
  it('leaves the business alone when another owner remains', async () => {
    h.clerk.addMember(ORG, { userId: 'user_owner2', role: 'owner' });
    const res = await remove('owner');
    expect(res.body.data).toEqual({ deleted: true, business_deleted: false });
    expect(h.clerk.deletedOrganizations).toEqual([]);
    expect(h.repo.tables.businesses.some((b) => b.id === h.business.id)).toBe(true);
  });

  it('refuses the only owner without the business name and changes nothing', async () => {
    for (const body of [undefined, {}, { confirm_business_name: 'Not the salon' }]) {
      const res = await remove('owner', body);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { rule: 'BUSINESS_NAME_MISMATCH' } });
    }
    expect(h.clerk.deletedUsers).toEqual([]);
    expect(h.clerk.deletedOrganizations).toEqual([]);
    expect(h.repo.tables.businesses.some((b) => b.id === h.business.id)).toBe(true);
  });

  it('deletes the organisation, the business and the login when the name matches (case-insensitive)', async () => {
    const res = await remove('owner', { confirm_business_name: `  ${h.business.name.toUpperCase()} ` });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true, business_deleted: true });
    expect(h.clerk.deletedOrganizations).toEqual([ORG]);
    expect(h.clerk.deletedUsers).toEqual(['user_owner']);
    expect(h.repo.tables.businesses.some((b) => b.id === h.business.id)).toBe(true); // the organisation.deleted webhook removes it
    await handleClerkEvent(h.repo, { type: 'organization.deleted', data: { id: ORG } });
    expect(h.repo.tables.businesses.some((b) => b.id === h.business.id)).toBe(false);
    expect(h.repo.tables.users.find((u) => u.id === 'user_staff')!.business_id).toBeNull();
    expect(h.repo.tables.audit_events.at(-1)).toMatchObject({
      businessId: h.business.id,
      actorId: 'user_owner',
      action: 'delete',
      entity: 'account',
      diff: { role: 'owner', business_deleted: true },
    });
  });

  it('does not touch local data when Clerk fails, so the owner can retry', async () => {
    h.clerk.failWith = new AppError('INTERNAL', 'Team service unavailable', { upstream: 'clerk' });
    const res = await remove('owner', { confirm_business_name: h.business.name });
    expect(res.status).toBe(500);
    expect(h.repo.tables.businesses.some((b) => b.id === h.business.id)).toBe(true);
    expect(h.repo.tables.audit_events.some((e) => e.entity === 'account')).toBe(false);
  });
});
