/**
 * Mirrors Clerk organisations, users and memberships into businesses,
 * users and staff. Handlers are idempotent (upserts), so Svix retries and
 * out-of-order delivery (membership before organisation) are safe.
 */
import type { MemberRole, UUID } from '@booking/types';
import { AppError } from '../lib/errors.ts';
import type { BookingRepository, StaffValues } from './repository.ts';
import type { BusinessRow, StaffRow } from './rows.ts';

export interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

export type ClerkEventResult = 'handled' | 'ignored';

export interface ClerkOrganization {
  id: string;
  name?: string | null;
  slug?: string | null;
}

interface ClerkUser {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: { id: string; email_address: string }[];
}

interface ClerkMembership {
  role?: string;
  public_metadata?: Record<string, unknown> | null;
  organization?: ClerkOrganization;
  public_user_data?: {
    user_id?: string;
    identifier?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
}

const MAX_SLUG = 60;

/** Lowercase ASCII slug: letters, digits and single hyphens. */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
  return slug || 'business';
}

/** First free slug among base, base-2, base-3, … (deterministic). */
export async function uniqueSlug(repo: BookingRepository, base: string, exceptBusinessId?: UUID): Promise<string> {
  const root = slugify(base);
  for (let n = 1; n <= 100; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = `${root.slice(0, MAX_SLUG - suffix.length)}${suffix}`;
    if (!(await repo.isSlugTaken(candidate, exceptBusinessId))) return candidate;
  }
  throw new Error('Could not allocate a unique business slug');
}

export function roleFromClerk(role: string | undefined): MemberRole {
  return role === 'org:admin' || role === 'admin' ? 'owner' : 'staff';
}

const fullName = (first?: string | null, last?: string | null) => [first, last].filter(Boolean).join(' ').trim() || null;

function primaryEmail(user: ClerkUser): string | null {
  const emails = user.email_addresses ?? [];
  return (emails.find((e) => e.id === user.primary_email_address_id) ?? emails[0])?.email_address ?? null;
}

export async function upsertBusiness(repo: BookingRepository, org: ClerkOrganization): Promise<BusinessRow> {
  const name = org.name?.trim() || 'My business';
  const existing = await repo.getBusinessByOrgId(org.id);
  if (!existing) {
    const slug = await uniqueSlug(repo, org.slug || name);
    return repo.insertBusiness({ clerk_org_id: org.id, name, slug });
  }
  const patch: { name?: string; slug?: string } = {};
  if (org.name && org.name !== existing.name) patch.name = name;
  if (org.slug && slugify(org.slug) !== existing.slug) patch.slug = await uniqueSlug(repo, org.slug, existing.id);
  if (Object.keys(patch).length) await repo.updateBusinessByOrgId(org.id, patch);
  return { ...existing, ...patch };
}

async function deleteOrganization(repo: BookingRepository, orgId: string) {
  const business = await repo.getBusinessByOrgId(orgId);
  if (!business) return;
  await repo.detachBusinessUsers(business.id);
  await repo.deleteBusinessByOrgId(orgId);
}

async function upsertUser(repo: BookingRepository, user: ClerkUser) {
  await repo.upsertUser({
    id: user.id,
    email: primaryEmail(user),
    display_name: fullName(user.first_name, user.last_name) ?? user.username ?? null,
    avatar_url: user.image_url ?? null,
  });
}

async function deleteUser(repo: BookingRepository, userId: string) {
  await repo.unlinkStaffUser(userId);
  await repo.deleteUser(userId);
}

export interface MemberInput {
  userId: string;
  role: MemberRole;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  /** Staff row named by the accepted invitation's public metadata (preferred link target) */
  staffId?: UUID | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameEmail = (a: string | null, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Links the login to an existing unlinked staff row. Returns false when the row is taken or gone. */
async function linkStaff(repo: BookingRepository, businessId: UUID, staff: StaffRow, m: MemberInput): Promise<boolean> {
  try {
    const patch: Partial<StaffValues> = { user_id: m.userId };
    if (!staff.email && m.email) patch.email = m.email;
    return (await repo.updateStaff(businessId, staff.id, patch)) !== null;
  } catch (err) {
    // Lost a race: the login already got a staff row (staff_business_user_key).
    if (err instanceof AppError && err.code === 'VALIDATION_FAILED' && (await repo.findStaffByUserId(businessId, m.userId))) return true;
    throw err;
  }
}

/**
 * Gives a login its calendar person: the staff row named by the invitation metadata,
 * else an unlinked active row with the same email (case-insensitive), else a new row.
 */
async function linkOrCreateStaff(repo: BookingRepository, business: BusinessRow, m: MemberInput) {
  if (await repo.findStaffByUserId(business.id, m.userId)) return;
  if (m.staffId && UUID_RE.test(m.staffId)) {
    const hinted = await repo.getStaff(business.id, m.staffId);
    if (hinted && !hinted.user_id && (await linkStaff(repo, business.id, hinted, m))) return;
  }
  if (m.email) {
    const byEmail = (await repo.listStaff(business.id)).find((s) => !s.user_id && s.is_active && sameEmail(s.email, m.email));
    if (byEmail && (await linkStaff(repo, business.id, byEmail, m))) return;
  }
  try {
    await repo.insertStaff(business.id, {
      user_id: m.userId,
      name: m.displayName ?? m.email?.split('@')[0] ?? 'Staff member',
      title: null,
      photo_url: m.avatarUrl ?? null,
      phone: null,
      email: m.email ?? null,
      color: null,
      is_active: true,
      accepts_bookings: true,
      sort_order: 0,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'VALIDATION_FAILED' && (await repo.findStaffByUserId(business.id, m.userId))) return;
    throw err;
  }
}

/**
 * Links a user to a business and makes sure a staff row exists for them.
 * Shared by the Clerk membership webhook, the session sync in requireAuth and in-app
 * onboarding so all converge on the same rows.
 */
export async function ensureMember(
  repo: BookingRepository,
  business: BusinessRow,
  m: MemberInput,
  opts: { createStaff: boolean },
) {
  await repo.upsertUser({
    id: m.userId,
    business_id: business.id,
    role: m.role,
    ...(m.email ? { email: m.email } : {}),
    ...(m.displayName ? { display_name: m.displayName } : {}),
    ...(m.avatarUrl ? { avatar_url: m.avatarUrl } : {}),
  });
  if (opts.createStaff) await linkOrCreateStaff(repo, business, m);
}

async function upsertMembership(repo: BookingRepository, m: ClerkMembership, created: boolean): Promise<ClerkEventResult> {
  const userId = m.public_user_data?.user_id;
  if (!m.organization?.id || !userId) return 'ignored';
  const business = await upsertBusiness(repo, m.organization);
  const identifier = m.public_user_data?.identifier ?? null;
  await ensureMember(
    repo,
    business,
    {
      userId,
      role: roleFromClerk(m.role),
      email: identifier?.includes('@') ? identifier : null,
      displayName: fullName(m.public_user_data?.first_name, m.public_user_data?.last_name),
      avatarUrl: m.public_user_data?.image_url ?? null,
      staffId: typeof m.public_metadata?.staff_id === 'string' ? m.public_metadata.staff_id : null,
    },
    { createStaff: created },
  );
  return 'handled';
}

async function deleteMembership(repo: BookingRepository, m: ClerkMembership): Promise<ClerkEventResult> {
  const userId = m.public_user_data?.user_id;
  if (!m.organization?.id || !userId) return 'ignored';
  const business = await repo.getBusinessByOrgId(m.organization.id);
  if (!business) return 'handled';
  const user = await repo.getUser(userId);
  if (user?.business_id === business.id) await repo.upsertUser({ id: userId, business_id: null, role: 'staff' });
  await repo.unlinkStaffUser(userId, business.id);
  return 'handled';
}

export async function handleClerkEvent(repo: BookingRepository, event: ClerkEvent): Promise<ClerkEventResult> {
  const data = event.data;
  const id = typeof data.id === 'string' ? data.id : null;
  switch (event.type) {
    case 'organization.created':
    case 'organization.updated':
      if (!id) return 'ignored';
      await upsertBusiness(repo, data as unknown as ClerkOrganization);
      return 'handled';
    case 'organization.deleted':
      if (!id) return 'ignored';
      await deleteOrganization(repo, id);
      return 'handled';
    case 'user.created':
    case 'user.updated':
      if (!id) return 'ignored';
      await upsertUser(repo, data as unknown as ClerkUser);
      return 'handled';
    case 'user.deleted':
      if (!id) return 'ignored';
      await deleteUser(repo, id);
      return 'handled';
    case 'organizationMembership.created':
    case 'organizationMembership.updated':
      return upsertMembership(repo, data as ClerkMembership, event.type === 'organizationMembership.created');
    case 'organizationMembership.deleted':
      return deleteMembership(repo, data as ClerkMembership);
    default:
      return 'ignored';
  }
}
