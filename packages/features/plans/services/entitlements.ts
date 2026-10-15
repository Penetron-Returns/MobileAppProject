/**
 * Plan entitlements. The database (`plan_features` via `business_features()`)
 * is the single source of truth; this module only reads it. Callers ask
 * "does this business have feature X?", never "which plan is it on?".
 */
import type { EntitlementsDTO, FeatureKey, UUID } from '@booking/types';
import type { Db } from '../../lib/db.ts';
import { AppError, mapDbError, notFound } from '../../lib/errors.ts';
import type { EntitlementService } from '../../ports.ts';

/** Every key the contract knows about; unknown keys in the table are ignored (forward compatible). */
export const FEATURE_KEYS: readonly FeatureKey[] = [
  'whatsapp_menu',
  'inbox',
  'companion',
  'desktop_app',
  'extensions',
  'assistant_bookings',
  'reports',
];

const isFeatureKey = (value: string): value is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(value);

export function createEntitlementService(deps: { db: Db }): EntitlementService {
  async function getEntitlements(businessId: UUID): Promise<EntitlementsDTO> {
    const { data, error } = await deps.db.rpc('business_features', { p_business_id: businessId });
    if (error) throw mapDbError(error);
    const rows = data ?? [];
    const first = rows[0];
    if (!first) throw notFound('Business plan');
    return {
      plan: first.plan,
      features: rows
        .filter((row) => isFeatureKey(row.feature))
        .map((row) => ({ feature: row.feature as FeatureKey, monthly_limit: row.monthly_limit ?? null })),
    };
  }

  /** Plans that unlock a feature, then the businesses on them (keyset on id). */
  async function listBusinessIdsWithFeature(feature: FeatureKey, opts: { after?: UUID; limit: number }): Promise<UUID[]> {
    const plans = await deps.db.from('plan_features').select('plan').eq('feature', feature);
    if (plans.error) throw mapDbError(plans.error);
    const planKeys = [...new Set((plans.data ?? []).map((row) => row.plan))];
    if (planKeys.length === 0) return [];
    let query = deps.db.from('businesses').select('id').in('plan', planKeys);
    if (opts.after) query = query.gt('id', opts.after);
    const businesses = await query.order('id').limit(opts.limit);
    if (businesses.error) throw mapDbError(businesses.error);
    return (businesses.data ?? []).map((row) => row.id);
  }

  return {
    getEntitlements,
    listBusinessIdsWithFeature,
    async hasFeature(businessId, feature) {
      const { features } = await getEntitlements(businessId);
      return features.some((f) => f.feature === feature);
    },
  };
}

/**
 * `hasFeature` for gates: a business with no plan row (NOT_FOUND) simply has no feature. Every other failure
 * (a transient database error) propagates so the caller's normal retry path applies instead of silently denying.
 */
export async function hasFeatureOrNone(entitlements: EntitlementService, businessId: UUID, feature: FeatureKey): Promise<boolean> {
  try {
    return await entitlements.hasFeature(businessId, feature);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') return false;
    throw error;
  }
}
