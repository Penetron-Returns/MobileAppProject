/**
 * In-app onboarding: a signed-in owner of a Clerk organisation creates (or
 * completes) the business without waiting for the Clerk webhook. It reuses
 * the webhook's upserts (clerkSync) and one atomic RPC for the setup, so both paths
 * converge on the same rows and the late webhook is a merge, not a duplicate.
 */
import type { OnboardingRequest, PlanKey, UUID } from '@booking/types';
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

/** The business's plan, from the entitlement service (plans are not on the business row). */
export type PlanLookup = (businessId: UUID) => Promise<PlanKey>;

type ServiceSeed = { name: string; duration_minutes: number; price_cents: number };

const sameServices = (a: ServiceSeed[], b: ServiceSeed[]) =>
  a.length === b.length && a.every((s, i) => s.name === b[i]!.name && s.duration_minutes === b[i]!.duration_minutes && s.price_cents === b[i]!.price_cents);

/**
 * The owner went back from the plan screen and changed the name or business type. Only an untouched business (no
 * active plan, no appointments) takes the change: the name is updated and, when the template differs, hours and
 * services are replaced. It converges on the request, so a retry is harmless. Config changes are audited by the
 * `audit_log` triggers on businesses, business_hours, services and staff_services.
 */
async function reviseUntouched(
  repo: BookingRepository,
  getPlan: PlanLookup,
  existing: BusinessRow,
  req: OnboardingRequest,
): Promise<BusinessRow> {
  const plan = await getPlan(existing.id);
  const isInactive = plan === 'none' || plan === 'free';
  if (!isInactive || (await repo.countAppointments(existing.id, {})) > 0) return existing;

  const name = req.business.name.trim();
  const business = name && name !== existing.name ? await repo.updateBusiness(existing.id, { name }) : existing;

  const [hours, services, staff] = await Promise.all([
    repo.listBusinessHours(existing.id),
    repo.listServices(existing.id),
    repo.listStaff(existing.id),
  ]);
  const wantedHours = req.hours.map((h) => ({ weekday: h.weekday, opens_at: normaliseTimeOfDay(h.opens_at), closes_at: normaliseTimeOfDay(h.closes_at) }));
  const hoursSame =
    hours.length === wantedHours.length &&
    wantedHours.every((w) => hours.some((h) => h.weekday === w.weekday && normaliseTimeOfDay(h.opens_at) === w.opens_at && normaliseTimeOfDay(h.closes_at) === w.closes_at));
  if (!hoursSame) await repo.replaceBusinessHours(existing.id, wantedHours);

  if (!sameServices(services, req.services)) {
    for (const s of services) await repo.deleteService(existing.id, s.id);
    const bookable = staff.filter((m) => m.is_active && m.accepts_bookings).map((m) => m.id);
    for (const [i, s] of req.services.entries()) {
      const row = await repo.insertService(existing.id, {
        name: s.name, description: null, category: null, duration_minutes: s.duration_minutes,
        price_cents: s.price_cents, deposit_cents: 0, is_active: true, sort_order: i,
      });
      await repo.setServiceStaff(existing.id, row.id, bookable);
    }
  }
  return business;
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
  getPlan: PlanLookup,
): Promise<BusinessRow> {
  const existing = await repo.getBusinessByOrgId(session.orgId);
  if (existing && (await isSetUp(repo, existing.id, session.userId))) {
    await ensureMember(repo, existing, { userId: session.userId, role: 'owner' }, { createStaff: true });
    return req.revise ? reviseUntouched(repo, getPlan, existing, req) : existing;
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
