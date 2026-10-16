/**
 * Read-through caches for the connector. They wrap ports (BookingRepository, EntitlementService) and
 * change nothing but latency: same arguments, same results, errors pass through uncached.
 *
 * Cached (change rarely, read on every tool call): business, services, staff, staff-service links, business
 * hours, special days, weekly staff rules and breaks, and the `companion` entitlement.
 * Never cached: appointments, busy ranges, overrides and time off (they decide availability), clients.
 */
import type { BookingRepository } from '@booking/features/repositories/types.ts';
import type { EntitlementService } from '@booking/features/ports.ts';
import { createTtlCache, type TtlCacheOptions } from './cache.ts';

export const STATIC_READ_TTL_MS = 30_000;
export const ENTITLEMENT_TTL_MS = 60_000;
const MAX_ENTRIES = 500;

export interface StaticReadCache {
  repo: BookingRepository;
  invalidate(businessId?: string): void;
}

export function withStaticReadCache(repo: BookingRepository, options: Partial<TtlCacheOptions> = {}): StaticReadCache {
  const cache = createTtlCache<unknown>({ ttlMs: STATIC_READ_TTL_MS, maxEntries: MAX_ENTRIES, ...options });
  // Key: business first so a business can be invalidated by prefix.
  const cached =
    <A extends unknown[], R>(name: string, read: (...args: A) => Promise<R>) =>
    (businessId: string, ...rest: unknown[]): Promise<R> =>
      cache.get(`${businessId}|${name}|${JSON.stringify(rest)}`, () =>
        (read as (...args: unknown[]) => Promise<R>)(businessId, ...rest),
      ) as Promise<R>;

  const wrapped: BookingRepository = {
    ...repo,
    getBusiness: cached('getBusiness', repo.getBusiness),
    listServices: cached('listServices', repo.listServices),
    getService: cached('getService', repo.getService),
    listStaff: cached('listStaff', repo.listStaff),
    getStaff: cached('getStaff', repo.getStaff),
    listStaffServices: cached('listStaffServices', repo.listStaffServices),
    listBusinessHours: cached('listBusinessHours', repo.listBusinessHours),
    listSpecialDays: cached('listSpecialDays', repo.listSpecialDays),
    listAvailabilityRules: cached('listAvailabilityRules', repo.listAvailabilityRules),
    listStaffBreaks: cached('listStaffBreaks', repo.listStaffBreaks),
  };
  return { repo: wrapped, invalidate: (businessId) => cache.invalidate(businessId ? `${businessId}|` : undefined) };
}

export interface EntitlementCache extends EntitlementService {
  invalidate(businessId?: string): void;
}

/** Caches `hasFeature` only (the per-call account gate); everything else reads through. */
export function withEntitlementCache(entitlements: EntitlementService, options: Partial<TtlCacheOptions> = {}): EntitlementCache {
  const cache = createTtlCache<boolean>({ ttlMs: ENTITLEMENT_TTL_MS, maxEntries: MAX_ENTRIES, ...options });
  return {
    ...entitlements,
    invalidate: (businessId) => cache.invalidate(businessId ? `${businessId}|` : undefined),
    hasFeature: (businessId, feature) => cache.get(`${businessId}|${feature}`, () => entitlements.hasFeature(businessId, feature)),
  };
}
