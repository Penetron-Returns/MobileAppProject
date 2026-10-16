import { AppError } from '@booking/features/lib/errors.ts';
import type { ClerkAdmin, ClerkOrgInvitation, ClerkOrgMember } from '@booking/features/ports.ts';

export interface FakeClerkAdmin extends ClerkAdmin {
  members: Map<string, ClerkOrgMember[]>;
  invitations: Map<string, ClerkOrgInvitation[]>;
  calls: string[];
  /** Logins removed with deleteUser, organisations with deleteOrganization */
  deletedUsers: string[];
  deletedOrganizations: string[];
  /** Makes every call fail, like a Clerk outage */
  failWith: AppError | null;
  addMember(orgId: string, member: Partial<ClerkOrgMember> & { userId: string }): void;
  /** Simulates the invitee accepting: the invitation becomes a membership carrying its metadata */
  accept(orgId: string, invitationId: string, profile: { userId: string; name?: string | null }): void;
}

/** In-memory Clerk organisation store honouring the ClerkAdmin contract. */
export function createFakeClerkAdmin(): FakeClerkAdmin {
  const members = new Map<string, ClerkOrgMember[]>();
  const invitations = new Map<string, ClerkOrgInvitation[]>();
  let seq = 0;
  const calls: string[] = [];
  const deletedUsers: string[] = [];
  const deletedOrganizations: string[] = [];
  const state = { failWith: null as AppError | null };

  const guard = (name: string) => {
    calls.push(name);
    if (state.failWith) throw state.failWith;
  };
  const membersOf = (orgId: string) => members.get(orgId) ?? [];
  const invitationsOf = (orgId: string) => invitations.get(orgId) ?? [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const fake: FakeClerkAdmin = {
    members,
    invitations,
    calls,
    deletedUsers,
    deletedOrganizations,
    get failWith() {
      return state.failWith;
    },
    set failWith(v) {
      state.failWith = v;
    },
    addMember(orgId, m) {
      members.set(orgId, [
        ...membersOf(orgId),
        { role: 'staff', email: null, name: null, imageUrl: null, staffId: null, ...m },
      ]);
    },
    accept(orgId, invitationId, profile) {
      const inv = invitationsOf(orgId).find((i) => i.id === invitationId);
      if (!inv) throw new Error('no such invitation');
      invitations.set(orgId, invitationsOf(orgId).filter((i) => i.id !== invitationId));
      fake.addMember(orgId, {
        userId: profile.userId,
        role: inv.role,
        email: inv.email,
        name: profile.name ?? null,
        staffId: inv.staffId,
      });
    },
    async createInvitation({ orgId, email, role, staffId }) {
      guard('createInvitation');
      if (membersOf(orgId).some((m) => m.email && same(m.email, email))) {
        throw new AppError('RULE_VIOLATION', 'That person is already a member', { rule: 'ALREADY_MEMBER' });
      }
      if (invitationsOf(orgId).some((i) => same(i.email, email))) {
        throw new AppError('RULE_VIOLATION', 'That email already has a pending invitation', { rule: 'ALREADY_INVITED' });
      }
      seq += 1;
      const inv: ClerkOrgInvitation = {
        id: `orginv_${seq}`,
        email,
        role,
        staffId: staffId ?? null,
        createdAt: new Date(Date.UTC(2026, 9, 14, 8, seq)).toISOString(),
      };
      invitations.set(orgId, [...invitationsOf(orgId), inv]);
      return { ...inv };
    },
    async listPendingInvitations(orgId) {
      guard('listPendingInvitations');
      return invitationsOf(orgId).map((i) => ({ ...i }));
    },
    async revokeInvitation({ orgId, invitationId }) {
      guard('revokeInvitation');
      if (!invitationsOf(orgId).some((i) => i.id === invitationId)) throw new AppError('NOT_FOUND', 'Not found');
      invitations.set(orgId, invitationsOf(orgId).filter((i) => i.id !== invitationId));
    },
    async listMembers(orgId) {
      guard('listMembers');
      return membersOf(orgId).map((m) => ({ ...m }));
    },
    async getMember(orgId, userId) {
      guard('getMember');
      const found = membersOf(orgId).find((m) => m.userId === userId);
      return found ? { ...found } : null;
    },
    async updateMemberRole(orgId, userId, role) {
      guard('updateMemberRole');
      const found = membersOf(orgId).find((m) => m.userId === userId);
      if (!found) throw new AppError('NOT_FOUND', 'Not found');
      found.role = role;
    },
    async removeMember(orgId, userId) {
      guard('removeMember');
      if (!membersOf(orgId).some((m) => m.userId === userId)) throw new AppError('NOT_FOUND', 'Not found');
      members.set(orgId, membersOf(orgId).filter((m) => m.userId !== userId));
    },
    async deleteUser(userId) {
      guard('deleteUser');
      for (const [orgId, list] of members) members.set(orgId, list.filter((m) => m.userId !== userId));
      if (!deletedUsers.includes(userId)) deletedUsers.push(userId);
    },
    async deleteOrganization(orgId) {
      guard('deleteOrganization');
      members.delete(orgId);
      invitations.delete(orgId);
      if (!deletedOrganizations.includes(orgId)) deletedOrganizations.push(orgId);
    },
  };
  return fake;
}
