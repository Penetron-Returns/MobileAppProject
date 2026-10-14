/**
 * Team management for a business (a Clerk organisation): invitations, members,
 * roles. Clerk is the source of truth for membership; users/staff are updated
 * in step so the app sees the change immediately without the Clerk webhook.
 */
import type {
  MemberRole,
  TeamDTO,
  TeamInvitationDTO,
  TeamMemberDTO,
  UUID,
} from '@booking/types';
import { notFound, ruleViolation } from '../../lib/errors.ts';
import type { ClerkAdmin, ClerkOrgInvitation, ClerkOrgMember } from '../../ports.ts';
import type { BookingRepository } from '../../repositories/types.ts';

export interface TeamCaller {
  userId: string;
  orgId: string;
  businessId: UUID;
  requestId?: string;
}

export interface TeamDeps {
  repo: BookingRepository;
  clerk: ClerkAdmin;
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

const toInvitationDTO = (i: ClerkOrgInvitation): TeamInvitationDTO => ({
  id: i.id,
  email: i.email,
  role: i.role,
  staff_id: i.staffId,
  created_at: i.createdAt,
});

async function toMemberDTOs(deps: TeamDeps, caller: TeamCaller, members: ClerkOrgMember[]): Promise<TeamMemberDTO[]> {
  const [staff, users] = await Promise.all([
    deps.repo.listStaff(caller.businessId),
    Promise.all(members.map((m) => deps.repo.getUser(m.userId))),
  ]);
  const staffByUser = new Map(staff.filter((s) => s.user_id).map((s) => [s.user_id as string, s.id]));
  return members.map((m, i) => ({
    user_id: m.userId,
    name: m.name ?? users[i]?.display_name ?? null,
    email: m.email ?? users[i]?.email ?? null,
    role: m.role,
    staff_id: staffByUser.get(m.userId) ?? null,
    is_self: m.userId === caller.userId,
  }));
}

export async function listTeam(deps: TeamDeps, caller: TeamCaller): Promise<TeamDTO> {
  const [members, invitations] = await Promise.all([
    deps.clerk.listMembers(caller.orgId),
    deps.clerk.listPendingInvitations(caller.orgId),
  ]);
  return { members: await toMemberDTOs(deps, caller, members), invitations: invitations.map(toInvitationDTO) };
}

function audit(
  deps: TeamDeps,
  caller: TeamCaller,
  e: { action: 'insert' | 'update' | 'delete'; entity: string; entityId: string; diff?: Record<string, unknown> },
) {
  return deps.repo.recordAudit({
    businessId: caller.businessId,
    actorId: caller.userId,
    ...e,
    ...(caller.requestId ? { requestId: caller.requestId } : {}),
  });
}

export async function inviteMember(
  deps: TeamDeps,
  caller: TeamCaller,
  input: { email: string; role: MemberRole; staffId?: UUID | null },
): Promise<TeamInvitationDTO> {
  const email = normaliseEmail(input.email);
  const staff = input.staffId ? await deps.repo.getStaff(caller.businessId, input.staffId) : null;
  if (input.staffId && !staff) throw notFound('Staff');
  if (staff?.user_id) throw ruleViolation('STAFF_ALREADY_LINKED', 'That staff member already has a login');

  const [members, pending] = await Promise.all([
    deps.clerk.listMembers(caller.orgId),
    deps.clerk.listPendingInvitations(caller.orgId),
  ]);
  if (members.some((m) => m.email && normaliseEmail(m.email) === email)) {
    throw ruleViolation('ALREADY_MEMBER', 'That person is already a member');
  }
  if (pending.some((i) => normaliseEmail(i.email) === email)) {
    throw ruleViolation('ALREADY_INVITED', 'That email already has a pending invitation');
  }

  const invitation = await deps.clerk.createInvitation({
    orgId: caller.orgId,
    email,
    role: input.role,
    inviterUserId: caller.userId,
    staffId: staff?.id ?? null,
  });
  if (staff && !staff.email) await deps.repo.updateStaff(caller.businessId, staff.id, { email });
  await audit(deps, caller, {
    action: 'insert',
    entity: 'team_invitation',
    entityId: invitation.id,
    diff: { role: input.role, staff_id: staff?.id ?? null },
  });
  return toInvitationDTO(invitation);
}

export async function revokeInvitation(
  deps: TeamDeps,
  caller: TeamCaller,
  invitationId: string,
): Promise<{ id: string; revoked: true }> {
  const pending = await deps.clerk.listPendingInvitations(caller.orgId);
  if (!pending.some((i) => i.id === invitationId)) throw notFound('Invitation');
  await deps.clerk.revokeInvitation({ orgId: caller.orgId, invitationId, requestingUserId: caller.userId });
  await audit(deps, caller, { action: 'delete', entity: 'team_invitation', entityId: invitationId });
  return { id: invitationId, revoked: true };
}

/** Throws LAST_OWNER when `member` is the only owner and would stop being one. */
async function assertNotLastOwner(deps: TeamDeps, caller: TeamCaller, member: ClerkOrgMember) {
  if (member.role !== 'owner') return;
  const owners = (await deps.clerk.listMembers(caller.orgId)).filter((m) => m.role === 'owner');
  if (owners.length <= 1) throw ruleViolation('LAST_OWNER', 'A business needs at least one owner');
}

async function requireMember(deps: TeamDeps, caller: TeamCaller, userId: string): Promise<ClerkOrgMember> {
  const member = await deps.clerk.getMember(caller.orgId, userId);
  if (!member) throw notFound('Member');
  return member;
}

export async function changeMemberRole(
  deps: TeamDeps,
  caller: TeamCaller,
  userId: string,
  role: MemberRole,
): Promise<TeamMemberDTO> {
  const member = await requireMember(deps, caller, userId);
  if (member.role !== role) {
    if (role !== 'owner') await assertNotLastOwner(deps, caller, member);
    await deps.clerk.updateMemberRole(caller.orgId, userId, role);
    const local = await deps.repo.getUser(userId);
    if (local?.business_id === caller.businessId) await deps.repo.upsertUser({ id: userId, role });
    await audit(deps, caller, {
      action: 'update',
      entity: 'team_member',
      entityId: userId,
      diff: { role: { old: member.role, new: role } },
    });
  }
  const [dto] = await toMemberDTOs(deps, caller, [{ ...member, role }]);
  return dto as TeamMemberDTO;
}

export async function removeMember(
  deps: TeamDeps,
  caller: TeamCaller,
  userId: string,
): Promise<{ user_id: string; removed: true }> {
  const member = await requireMember(deps, caller, userId);
  await assertNotLastOwner(deps, caller, member);
  await deps.clerk.removeMember(caller.orgId, userId);
  const local = await deps.repo.getUser(userId);
  if (local?.business_id === caller.businessId) {
    await deps.repo.upsertUser({ id: userId, business_id: null, role: 'staff' });
  }
  // The staff row stays (appointments reference it); only the login link goes.
  await deps.repo.unlinkStaffUser(userId, caller.businessId);
  await audit(deps, caller, { action: 'delete', entity: 'team_member', entityId: userId, diff: { role: member.role } });
  return { user_id: userId, removed: true };
}
