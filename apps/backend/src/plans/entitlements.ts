/**
 * Plan entitlements. The database (`plan_features` via `business_features()`)
 * is the single source of truth; this module only reads it. Callers ask
 * "does this business have feature X?", never "which plan is it on?".
 */
import type { EntitlementsDTO, FeatureKey, UUID } from '../../../../packages/shared/api.ts';
import type { Db } from '../lib/db.ts';
import { mapDbError, notFound } from '../lib/errors.ts';
import type { EntitlementService } from '../ports.ts';

/** Every key the contract knows about; unknown keys in the table are ignored (forward compatible). */
export const FEATURE_KEYS: readonly FeatureKey[] = [
  'whatsapp_menu',
  'inbox',
  'companion',
  'desktop_app',
  'extensions',
  'assistant_bookings',
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

  return {
    getEntitlements,
    async hasFeature(businessId, feature) {
      const { features } = await getEntitlements(businessId);
      return features.some((f) => f.feature === feature);
    },
  };
}
