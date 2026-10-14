/**
 * In-app onboarding: a signed-in owner of a Clerk organisation creates (or
 * completes) the business without waiting for the Clerk webhook. It reuses
 * the webhook's upserts (clerkSync) and the admin operations, so both paths
 * converge on the same rows and the late webhook is a merge, not a duplicate.
 */
import type { OnboardingRequest, UUID } from '../../../../packages/shared/api.ts';
import { AppError } from '../lib/errors.ts';
import { createService, createStaff, replaceBusinessHours } from './admin.ts';
import { ensureMember, upsertBusiness } from './clerkSync.ts';
import type { BookingRepository } from './repository.ts';
import type { BusinessRow } from './rows.ts';

export interface OnboardingSession {
  userId: string;
  orgId: string;
}

async function ensureBusiness(repo: BookingRepository, orgId: string, name: string): Promise<BusinessRow> {
  try {
    return await upsertBusiness(repo, { id: orgId, name });
  } catch (err) {
    // Lost a race with the Clerk webhook inserting the same org: read its row instead.
    const winner = await repo.getBusinessByOrgId(orgId);
    if (winner) return winner;
    throw err;
  }
}

/** A business counts as set up once hours, services or extra staff exist; re-runs then change nothing. */
async function isSetUp(repo: BookingRepository, businessId: UUID, ownerId: string): Promise<boolean> {
  const [hours, services, staff] = await Promise.all([
    repo.listBusinessHours(businessId),
    repo.listServices(businessId),
    repo.listStaff(businessId),
  ]);
  return hours.length > 0 || services.length > 0 || staff.some((s) => s.user_id !== ownerId);
}

export async function completeOnboarding(
  repo: BookingRepository,
  session: OnboardingSession,
  req: OnboardingRequest,
): Promise<BusinessRow> {
  const existing = await repo.getBusinessByOrgId(session.orgId);
  if (existing && (await isSetUp(repo, existing.id, session.userId))) {
    await ensureMember(repo, existing, { userId: session.userId, role: 'owner' }, { createStaff: true });
    return existing;
  }

  const business = await ensureBusiness(repo, session.orgId, req.business.name);
  const knownUser = await repo.getUser(session.userId);
  await ensureMember(
    repo,
    business,
    { userId: session.userId, role: 'owner', displayName: req.owner_name?.trim() || knownUser?.display_name || 'Owner' },
    { createStaff: true },
  );
  const owner = await repo.findStaffByUserId(business.id, session.userId);
  if (!owner) throw new AppError('INTERNAL', 'Owner staff row missing after onboarding');

  await replaceBusinessHours(repo, business.id, req.hours);
  const staffIds = [owner.id];
  for (const [i, member] of req.team.entries()) {
    const row = await createStaff(repo, business.id, { name: member.name, title: member.title ?? null, sort_order: i + 1 });
    staffIds.push(row.id);
  }
  for (const [i, service] of req.services.entries()) {
    await createService(repo, business.id, { ...service, sort_order: i, staff_ids: staffIds });
  }
  return business;
}
