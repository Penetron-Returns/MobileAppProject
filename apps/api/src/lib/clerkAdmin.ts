/**
 * Clerk Backend API client for organisation members and invitations
 * (https://clerk.com/docs/reference/backend-api). The only place that talks to
 * api.clerk.com; everything else depends on the ClerkAdmin port.
 */
import type { MemberRole, UUID } from '@booking/types';
import type { ClerkAdmin, ClerkOrgInvitation, ClerkOrgMember } from '../ports.ts';
import { AppError } from './errors.ts';

const PAGE = 100;
const MAX_PAGES = 10;
const CLERK_ADMIN_ROLE = 'org:admin';
const CLERK_MEMBER_ROLE = 'org:member';

interface RawInvitation {
  id: string;
  email_address: string;
  role: string;
  status?: string;
  public_metadata?: Record<string, unknown> | null;
  created_at: number;
}

interface RawMembership {
  role: string;
  public_metadata?: Record<string, unknown> | null;
  public_user_data?: {
    user_id?: string;
    identifier?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  } | null;
}

interface ClerkErrorBody {
  errors?: { code?: string; message?: string }[];
}

export interface ClerkAdminOptions {
  secretKey: string | undefined;
  fetch?: typeof fetch;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

const toClerkRole = (role: MemberRole) => (role === 'owner' ? CLERK_ADMIN_ROLE : CLERK_MEMBER_ROLE);
const fromClerkRole = (role: string): MemberRole => (role === CLERK_ADMIN_ROLE || role === 'admin' ? 'owner' : 'staff');
const staffIdOf = (meta: Record<string, unknown> | null | undefined): UUID | null =>
  typeof meta?.staff_id === 'string' ? meta.staff_id : null;

function toInvitation(raw: RawInvitation): ClerkOrgInvitation {
  return {
    id: raw.id,
    email: raw.email_address,
    role: fromClerkRole(raw.role),
    staffId: staffIdOf(raw.public_metadata),
    createdAt: new Date(raw.created_at).toISOString(),
  };
}

function toMember(raw: RawMembership): ClerkOrgMember | null {
  const data = raw.public_user_data;
  if (!data?.user_id) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return {
    userId: data.user_id,
    role: fromClerkRole(raw.role),
    email: data.identifier?.includes('@') ? data.identifier : null,
    name: name || null,
    imageUrl: data.image_url ?? null,
    staffId: staffIdOf(raw.public_metadata),
  };
}

/** Maps a Clerk failure to an AppError. Error bodies are never copied (they can echo emails). */
function mapClerkError(status: number, body: ClerkErrorBody | null, kind: 'invite' | 'other'): AppError {
  const code = body?.errors?.[0]?.code ?? '';
  if (code.includes('already_a_member')) {
    return new AppError('RULE_VIOLATION', 'That person is already a member', { rule: 'ALREADY_MEMBER' });
  }
  if (kind === 'invite' && (code.includes('duplicate') || code.includes('already_invited') || status === 409)) {
    return new AppError('RULE_VIOLATION', 'That email already has a pending invitation', { rule: 'ALREADY_INVITED' });
  }
  if (status === 404) return new AppError('NOT_FOUND', 'Not found');
  if (status === 429) return new AppError('RATE_LIMITED', 'Too many requests, try again shortly');
  if (status === 400 || status === 422) {
    return new AppError('VALIDATION_FAILED', 'Clerk rejected the request', { upstream: 'clerk', clerk_code: code || null });
  }
  return new AppError('INTERNAL', 'Team service unavailable', { upstream: 'clerk', status });
}

export function createClerkAdmin(opts: ClerkAdminOptions): ClerkAdmin {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? 'https://api.clerk.com/v1';
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  async function call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    kind: 'invite' | 'other' = 'other',
  ): Promise<T> {
    if (!opts.secretKey) throw new AppError('INTERNAL', 'Clerk is not configured', { upstream: 'clerk' });
    // Only reads are retried: a repeated write could act twice.
    const attempts = method === 'GET' ? 3 : 1;
    for (let attempt = 1; ; attempt += 1) {
      let res: Response;
      try {
        res = await doFetch(`${base}${path}`, {
          method,
          headers: { authorization: `Bearer ${opts.secretKey}`, 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch {
        if (attempt < attempts) {
          await sleep(200 * 2 ** attempt);
          continue;
        }
        throw new AppError('INTERNAL', 'Team service unreachable', { upstream: 'clerk' });
      }
      if (res.ok) return (await res.json().catch(() => ({}))) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < attempts) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      throw mapClerkError(res.status, (await res.json().catch(() => null)) as ClerkErrorBody | null, kind);
    }
  }

  async function paged<R>(path: string, query: string): Promise<R[]> {
    const out: R[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const res = await call<{ data?: R[] } | R[]>('GET', `${path}?${query}&limit=${PAGE}&offset=${page * PAGE}`);
      const items = Array.isArray(res) ? res : (res.data ?? []);
      out.push(...items);
      if (items.length < PAGE) break;
    }
    return out;
  }

  const org = (orgId: string) => `/organizations/${encodeURIComponent(orgId)}`;

  return {
    async createInvitation({ orgId, email, role, inviterUserId, staffId }) {
      const raw = await call<RawInvitation>(
        'POST',
        `${org(orgId)}/invitations`,
        {
          email_address: email,
          role: toClerkRole(role),
          inviter_user_id: inviterUserId,
          public_metadata: staffId ? { staff_id: staffId } : {},
        },
        'invite',
      );
      return toInvitation(raw);
    },
    async listPendingInvitations(orgId) {
      return (await paged<RawInvitation>(`${org(orgId)}/invitations`, 'status=pending')).map(toInvitation);
    },
    async revokeInvitation({ orgId, invitationId, requestingUserId }) {
      await call('POST', `${org(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`, {
        requesting_user_id: requestingUserId,
      });
    },
    async listMembers(orgId) {
      const raw = await paged<RawMembership>(`${org(orgId)}/memberships`, 'order_by=%2Bcreated_at');
      return raw.flatMap((m) => toMember(m) ?? []);
    },
    async getMember(orgId, userId) {
      const raw = await paged<RawMembership>(`${org(orgId)}/memberships`, `user_id=${encodeURIComponent(userId)}`);
      // Defensive: an ignored filter would return somebody else.
      return raw.flatMap((m) => toMember(m) ?? []).find((m) => m.userId === userId) ?? null;
    },
    async updateMemberRole(orgId, userId, role) {
      await call('PATCH', `${org(orgId)}/memberships/${encodeURIComponent(userId)}`, { role: toClerkRole(role) });
    },
    async removeMember(orgId, userId) {
      await call('DELETE', `${org(orgId)}/memberships/${encodeURIComponent(userId)}`);
    },
  };
}
