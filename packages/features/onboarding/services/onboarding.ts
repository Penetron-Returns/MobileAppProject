/**
 * In-app onboarding: a signed-in owner of a Clerk organisation creates (or
 * completes) the business without waiting for the Clerk webhook. It reuses
 * the webhook's upserts (clerkSync) and one atomic RPC for the setup, so both paths
 * converge on the same rows and the late webhook is a merge, not a duplicate.
 */
import type { OnboardingRequest, UUID } from '@booking/types';
import { normaliseTimeOfDay } from '../../lib/time.ts';
import { ensureMember, upsertBusiness } from '../../team/services/clerkSync.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import type { BusinessRow } from '../../repositories/rows.ts';

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

/** Where a business is when the app sends no locale (an older build): neutral, never a country's default. */
export const FALLBACK_TIMEZONE = 'UTC';
export const FALLBACK_CURRENCY = 'USD';

/** A business that is not set up yet takes the owner's timezone and currency instead of the database defaults. */
async function applyLocale(repo: BookingRepository, business: BusinessRow, locale: OnboardingRequest['business']): Promise<BusinessRow> {
  return repo.updateBusiness(business.id, {
    timezone: locale.timezone ?? FALLBACK_TIMEZONE,
    currency: locale.currency ?? FALLBACK_CURRENCY,
  });
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

  const business = await applyLocale(repo, await ensureBusiness(repo, session.orgId, req.business.name), req.business);
  const knownUser = await repo.getUser(session.userId);
  const ownerName = req.owner_name?.trim() || knownUser?.display_name || 'Owner';
  // The owner's staff row is created inside the RPC, under the business lock, so a concurrent double submit cannot duplicate it.
  await ensureMember(repo, business, { userId: session.userId, role: 'owner', displayName: ownerName }, { createStaff: false });

  // Hours, team, services and the completion marker commit together: a failure leaves nothing behind and a retry
  // (or a racing duplicate) either completes the setup or finds it already done.
  await repo.completeOnboarding({
    businessId: business.id,
    userId: session.userId,
    ownerName,
    hours: req.hours.map((h) => ({ weekday: h.weekday, opens_at: normaliseTimeOfDay(h.opens_at), closes_at: normaliseTimeOfDay(h.closes_at) })),
    team: req.team.map((m) => ({ name: m.name, title: m.title ?? null })),
    services: req.services,
  });
  return business;
}
