import { describe, expect, it } from 'vitest';

import { createClerkAdmin } from '@booking/features/team/lib/clerkAdmin.ts';
import { AppError } from '@booking/features/lib/errors.ts';

interface Recorded {
  method: string;
  url: string;
  body: unknown;
  auth: string | null;
}

function fakeFetch(responses: { status?: number; body?: unknown }[]) {
  const calls: Recorded[] = [];
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: new Headers(init?.headers).get('authorization'),
    });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  };
  return { calls, impl: impl as typeof fetch };
}

const client = (f: ReturnType<typeof fakeFetch>) =>
  createClerkAdmin({ secretKey: 'sk_test_x', fetch: f.impl, baseUrl: 'https://clerk.test/v1', sleep: async () => {} });

const rawInvitation = {
  id: 'orginv_1',
  email_address: 'a@example.com',
  role: 'org:member',
  public_metadata: { staff_id: 'abc' },
  created_at: Date.UTC(2026, 9, 14),
};

describe('createClerkAdmin', () => {
  it('creates an invitation with role, inviter and staff metadata', async () => {
    const f = fakeFetch([{ body: rawInvitation }]);
    const inv = await client(f).createInvitation({ orgId: 'org_1', email: 'a@example.com', role: 'staff', inviterUserId: 'user_1', staffId: 'abc' });
    expect(f.calls[0]).toEqual({
      method: 'POST',
      url: 'https://clerk.test/v1/organizations/org_1/invitations',
      auth: 'Bearer sk_test_x',
      body: { email_address: 'a@example.com', role: 'org:member', inviter_user_id: 'user_1', public_metadata: { staff_id: 'abc' } },
    });
    expect(inv).toEqual({ id: 'orginv_1', email: 'a@example.com', role: 'staff', staffId: 'abc', createdAt: '2026-10-14T00:00:00.000Z' });
  });

  it('maps owners to org:admin', async () => {
    const f = fakeFetch([{ body: { ...rawInvitation, role: 'org:admin' } }]);
    const inv = await client(f).createInvitation({ orgId: 'o', email: 'a@example.com', role: 'owner', inviterUserId: 'u' });
    expect((f.calls[0]!.body as { role: string }).role).toBe('org:admin');
    expect(inv.role).toBe('owner');
  });

  it('lists pending invitations from the data envelope', async () => {
    const f = fakeFetch([{ body: { data: [rawInvitation], total_count: 1 } }]);
    const list = await client(f).listPendingInvitations('org_1');
    expect(f.calls[0]!.url).toBe('https://clerk.test/v1/organizations/org_1/invitations?status=pending&limit=100&offset=0');
    expect(list).toHaveLength(1);
  });

  it('revokes with the requesting user', async () => {
    const f = fakeFetch([{ body: rawInvitation }]);
    await client(f).revokeInvitation({ orgId: 'org_1', invitationId: 'orginv_1', requestingUserId: 'user_1' });
    expect(f.calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://clerk.test/v1/organizations/org_1/invitations/orginv_1/revoke',
      body: { requesting_user_id: 'user_1' },
    });
  });

  it('reads members, metadata and profile from memberships', async () => {
    const membership = {
      role: 'org:admin',
      public_metadata: { staff_id: 'abc' },
      public_user_data: { user_id: 'user_1', identifier: 'a@example.com', first_name: 'Ada', last_name: 'L', image_url: 'https://img' },
    };
    const f = fakeFetch([{ body: { data: [{ ...membership, public_user_data: { user_id: 'other', identifier: 'o@x.com' } }, membership] } }]);
    const member = await client(f).getMember('org_1', 'user_1');
    expect(f.calls[0]!.url).toContain('/organizations/org_1/memberships?user_id=user_1');
    expect(member).toEqual({ userId: 'user_1', role: 'owner', email: 'a@example.com', name: 'Ada L', imageUrl: 'https://img', staffId: 'abc' });
    const missing = await client(fakeFetch([{ body: { data: [] } }])).getMember('org_1', 'user_9');
    expect(missing).toBeNull();
  });

  it('updates and removes memberships', async () => {
    const f = fakeFetch([{ body: {} }]);
    const c = client(f);
    await c.updateMemberRole('org_1', 'user_1', 'owner');
    await c.removeMember('org_1', 'user_1');
    expect(f.calls[0]).toMatchObject({ method: 'PATCH', url: 'https://clerk.test/v1/organizations/org_1/memberships/user_1', body: { role: 'org:admin' } });
    expect(f.calls[1]).toMatchObject({ method: 'DELETE', url: 'https://clerk.test/v1/organizations/org_1/memberships/user_1' });
  });

  it.each([
    [422, { errors: [{ code: 'duplicate_record' }] }, 'RULE_VIOLATION', 'ALREADY_INVITED'],
    [400, { errors: [{ code: 'already_a_member_in_organization' }] }, 'RULE_VIOLATION', 'ALREADY_MEMBER'],
    [404, { errors: [{ code: 'resource_not_found' }] }, 'NOT_FOUND', undefined],
    [429, { errors: [] }, 'RATE_LIMITED', undefined],
    [422, { errors: [{ code: 'form_param_format_invalid' }] }, 'VALIDATION_FAILED', undefined],
    [401, { errors: [{ code: 'authentication_invalid' }] }, 'INTERNAL', undefined],
  ])('maps Clerk %i to %s', async (status, body, code, rule) => {
    const f = fakeFetch([{ status, body }]);
    const err = await client(f)
      .createInvitation({ orgId: 'o', email: 'a@example.com', role: 'staff', inviterUserId: 'u' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    expect((err as AppError).details?.rule).toBe(rule);
    expect(f.calls).toHaveLength(1); // writes are never retried
    expect(JSON.stringify(err)).not.toContain('a@example.com');
  });

  it('retries transient read failures and gives up after three attempts', async () => {
    const ok = fakeFetch([{ status: 503 }, { status: 429 }, { body: { data: [] } }]);
    expect(await client(ok).listMembers('o')).toEqual([]);
    expect(ok.calls).toHaveLength(3);
    const down = fakeFetch([{ status: 500 }]);
    await expect(client(down).listMembers('o')).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(down.calls).toHaveLength(3);
  });

  it('fails clearly when no secret key is configured', async () => {
    const f = fakeFetch([{}]);
    await expect(createClerkAdmin({ secretKey: undefined, fetch: f.impl }).listMembers('o')).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(f.calls).toHaveLength(0);
  });
});

describe('createClerkAdmin account deletion', () => {
  it('deletes a user and an organisation with DELETE, never retrying', async () => {
    const f = fakeFetch([{ body: { deleted: true } }]);
    await client(f).deleteUser('user_1');
    await client(f).deleteOrganization('org_1');
    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'DELETE https://clerk.test/v1/users/user_1',
      'DELETE https://clerk.test/v1/organizations/org_1',
    ]);
  });

  it('merges public metadata into an organisation with PATCH /metadata', async () => {
    const f = fakeFetch([{ body: {} }]);
    await client(f).updateOrganizationPublicMetadata('org_1', { plan: 'growth', billingStatus: 'active', periodEnd: null });
    expect(f.calls).toEqual([
      {
        method: 'PATCH',
        url: 'https://clerk.test/v1/organizations/org_1/metadata',
        body: { public_metadata: { plan: 'growth', billingStatus: 'active', periodEnd: null } },
        auth: 'Bearer sk_test_x',
      },
    ]);
  });

  it('treats a 404 as already deleted but surfaces other failures', async () => {
    await expect(client(fakeFetch([{ status: 404 }])).deleteUser('user_1')).resolves.toBeUndefined();
    await expect(client(fakeFetch([{ status: 404 }])).deleteOrganization('org_1')).resolves.toBeUndefined();
    await expect(client(fakeFetch([{ status: 500 }])).deleteUser('user_1')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
