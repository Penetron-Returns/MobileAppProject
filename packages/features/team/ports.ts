/** Organisation membership port (Clerk Backend API). */
import type { ISODateTime, MemberRole, UUID } from '@booking/types';

/** A member of a Clerk organisation as the Clerk Backend API reports it. */
export interface ClerkOrgMember {
  userId: string;
  role: MemberRole;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
  /** `staff_id` carried over from the accepted invitation's public metadata */
  staffId: UUID | null;
}

export interface ClerkOrgInvitation {
  id: string;
  email: string;
  role: MemberRole;
  staffId: UUID | null;
  createdAt: ISODateTime;
}

/**
 * Clerk Backend API for organisation membership. Implementations throw AppError:
 * RULE_VIOLATION (`details.rule` ALREADY_INVITED | ALREADY_MEMBER) for duplicates,
 * NOT_FOUND, RATE_LIMITED, INTERNAL for everything else. Never logs emails or tokens.
 */
export interface ClerkAdmin {
  createInvitation(input: {
    orgId: string;
    email: string;
    role: MemberRole;
    inviterUserId: string;
    staffId?: UUID | null;
  }): Promise<ClerkOrgInvitation>;
  listPendingInvitations(orgId: string): Promise<ClerkOrgInvitation[]>;
  revokeInvitation(input: { orgId: string; invitationId: string; requestingUserId: string }): Promise<void>;
  listMembers(orgId: string): Promise<ClerkOrgMember[]>;
  /** null when the user is not a member of the organisation */
  getMember(orgId: string, userId: string): Promise<ClerkOrgMember | null>;
  updateMemberRole(orgId: string, userId: string, role: MemberRole): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;
  /** Permanently deletes the login (and so every membership). A user Clerk no longer knows counts as deleted. */
  deleteUser(userId: string): Promise<void>;
  /** Permanently deletes the organisation and its memberships. An organisation Clerk no longer knows counts as deleted. */
  deleteOrganization(orgId: string): Promise<void>;
}
