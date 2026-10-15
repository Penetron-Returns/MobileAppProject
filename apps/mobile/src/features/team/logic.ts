import type {
  MemberRole,
  TeamDTO,
  TeamInvitationDTO,
  TeamMemberDTO,
} from '@booking/types';
import { z } from 'zod';

import { staffStatus, joinMeta } from '@/features/settings/lists';
import { isApiError } from '@/lib/api';

/** The calendar person fields the Team screen reads (a subset of the staff row). */
export interface StaffPerson {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  color: string | null;
  is_active: boolean;
  accepts_bookings: boolean;
}

/** Whether a person can sign in: has a login, was invited, or is calendar-only. */
export type PersonAccess = 'member' | 'invited' | 'none';

export interface TeamPerson {
  /** Stable list key: the staff id, or the login / invitation of someone with no staff row. */
  key: string;
  staff: StaffPerson | null;
  name: string;
  job: string | null;
  access: PersonAccess;
  /** The login's role, or the role the invitation offers. */
  role: MemberRole | null;
  member: TeamMemberDTO | null;
  invitation: TeamInvitationDTO | null;
}

function byStaffId<T extends { staff_id: string | null }>(
  rows: readonly T[],
  staffId: string,
): T | null {
  return rows.find((row) => row.staff_id === staffId) ?? null;
}

/**
 * Combines the calendar people (staff rows) with the Clerk team: each person
 * is a member (has a login), invited (pending invitation) or has no app
 * access. Logins and invitations whose staff row is unknown (an email invite
 * not yet accepted, a login whose staff row was deleted) follow as their own
 * rows so nothing is hidden from the owner. `team` is undefined for staff
 * users, who can read only the staff rows.
 */
export function buildTeam(
  staff: readonly StaffPerson[],
  team: TeamDTO | undefined,
): TeamPerson[] {
  const members = team?.members ?? [];
  const invitations = team?.invitations ?? [];
  const staffIds = new Set(staff.map((s) => s.id));

  const people: TeamPerson[] = staff.map((s) => {
    const member = byStaffId(members, s.id);
    const invitation = member ? null : byStaffId(invitations, s.id);
    return {
      key: s.id,
      staff: s,
      name: s.name,
      job: s.title,
      access: member ? 'member' : invitation ? 'invited' : 'none',
      role: member?.role ?? invitation?.role ?? null,
      member,
      invitation,
    };
  });

  for (const member of members) {
    if (member.staff_id && staffIds.has(member.staff_id)) continue;
    people.push({
      key: `member:${member.user_id}`,
      staff: null,
      name: member.name ?? member.email ?? member.user_id,
      job: null,
      access: 'member',
      role: member.role,
      member,
      invitation: null,
    });
  }
  for (const invitation of invitations) {
    if (invitation.staff_id && staffIds.has(invitation.staff_id)) continue;
    people.push({
      key: `invite:${invitation.id}`,
      staff: null,
      name: invitation.email,
      job: null,
      access: 'invited',
      role: invitation.role,
      member: null,
      invitation,
    });
  }
  return people;
}

/**
 * Whether the list may offer "Remove from team" on a swipe: a login that is
 * neither the owner nor the signed-in person (who cannot remove themselves).
 */
export function canRemoveMember(person: TeamPerson): boolean {
  const { member } = person;
  return member !== null && !member.is_self && member.role !== 'owner';
}

/** i18n key suffix of the access status shown under a person's name. */
export type AccessNote = 'owner' | 'staff' | 'invited' | 'none';

/** What the list row adds after the job: Owner, Staff, Invite pending, No app access. */
export function accessNote(person: TeamPerson): AccessNote {
  if (person.access === 'invited') return 'invited';
  if (person.access === 'none') return 'none';
  // A login always shows its role, so the line is never empty.
  return person.role === 'owner' ? 'owner' : 'staff';
}

/**
 * The line under a name in the list: the job, then Owner / Invite pending /
 * No app access, then Inactive / Not taking bookings (exceptions only).
 */
export function personSubtitle(
  person: TeamPerson,
  t: (key: string) => string,
): string {
  const note = accessNote(person);
  const status = person.staff ? staffStatus(person.staff) : 'active';
  return joinMeta(
    person.job,
    note && t(`team.access.${note}`),
    status !== 'active' && t(`team.status.${status}`),
  );
}

export const inviteSchema = (t: (key: string) => string) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, t('forms.required'))
      .pipe(z.email(t('forms.invalidEmail'))),
  });

export type InviteValues = z.infer<ReturnType<typeof inviteSchema>>;

/** The rules the team routes refuse with `RULE_VIOLATION` (docs/BUILD_PLAN.md). */
const TEAM_RULES = [
  'LAST_OWNER',
  'ALREADY_MEMBER',
  'ALREADY_INVITED',
  'STAFF_ALREADY_LINKED',
] as const;

export type TeamRule = (typeof TEAM_RULES)[number];

/**
 * The `team.errors.*` key for an error from a team route, or null when it has
 * no team-specific wording (the generic error toast then applies).
 */
export function teamErrorKey(error: unknown): `team.errors.${string}` | null {
  if (!isApiError(error)) return null;
  if (error.code === 'FORBIDDEN') return 'team.errors.FORBIDDEN';
  if (error.code === 'RULE_VIOLATION') {
    const rule = error.details?.rule;
    return TEAM_RULES.find((r) => r === rule)
      ? (`team.errors.${rule as TeamRule}` as const)
      : null;
  }
  return null;
}
