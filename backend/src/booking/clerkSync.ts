/**
 * Mirrors Clerk organisations, users and memberships into businesses,
 * users and staff. Handlers are idempotent (upserts), so Svix retries and
 * out-of-order delivery (membership before organisation) are safe.
 */
import type { MemberRole, UUID } from '../../../shared/api.ts';
import type { BookingRepository } from './repository.ts';
import type { BusinessRow } from './rows.ts';

export interface ClerkEvent {
  type: string;
  data: Record<string, unknown>;
}

export type ClerkEventResult = 'handled' | 'ignored';

interface ClerkOrganization {
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

async function upsertBusiness(repo: BookingRepository, org: ClerkOrganization): Promise<BusinessRow> {
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

async function upsertMembership(repo: BookingRepository, m: ClerkMembership, created: boolean): Promise<ClerkEventResult> {
  const userId = m.public_user_data?.user_id;
  if (!m.organization?.id || !userId) return 'ignored';
  const business = await upsertBusiness(repo, m.organization);
  const identifier = m.public_user_data?.identifier ?? null;
  const email = identifier?.includes('@') ? identifier : null;
  const displayName = fullName(m.public_user_data?.first_name, m.public_user_data?.last_name);
  await repo.upsertUser({
    id: userId,
    business_id: business.id,
    role: roleFromClerk(m.role),
    ...(email ? { email } : {}),
    ...(displayName ? { display_name: displayName } : {}),
    ...(m.public_user_data?.image_url ? { avatar_url: m.public_user_data.image_url } : {}),
  });
  if (created && !(await repo.findStaffByUserId(business.id, userId))) {
    await repo.insertStaff(business.id, {
      user_id: userId,
      name: displayName ?? email?.split('@')[0] ?? 'Staff member',
      title: null,
      photo_url: m.public_user_data?.image_url ?? null,
      phone: null,
      email,
      color: null,
      is_active: true,
      accepts_bookings: true,
      sort_order: 0,
    });
  }
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
