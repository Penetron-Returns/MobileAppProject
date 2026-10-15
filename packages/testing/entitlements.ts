/** In-memory EntitlementService, mirroring the plan_features seed. */
import type { EntitlementService } from '@booking/features/ports.ts';
import type { FeatureKey, PlanKey } from '@booking/types';

/**
 * Mirror of the plan_features seed in packages/database/supabase/migrations/20261014000001_plan_flags.sql
 * (a test asserts the two stay identical).
 */
export const PLAN_FEATURES: Record<PlanKey, FeatureKey[]> = {
  free: ['whatsapp_menu', 'inbox', 'extensions'],
  starter: ['companion', 'desktop_app', 'extensions', 'assistant_bookings', 'reports'],
  growth: ['companion', 'desktop_app', 'extensions', 'assistant_bookings', 'reports'],
  pro: ['companion', 'desktop_app', 'extensions', 'assistant_bookings', 'reports'],
};

/** In-memory EntitlementService for one plan; `limits` sets monthly caps per feature. */
export function fakeEntitlements(
  plan: PlanKey = 'free',
  limits: Partial<Record<FeatureKey, number>> = {},
): EntitlementService {
  const get = async () => ({
    plan,
    features: PLAN_FEATURES[plan].map((feature) => ({
      feature,
      monthly_limit: limits[feature] ?? null,
    })),
  });
  return {
    getEntitlements: get,
    async hasFeature(_businessId, feature) {
      return PLAN_FEATURES[plan].includes(feature);
    },
    async listBusinessIdsWithFeature() {
      return [];
    },
  };
}
