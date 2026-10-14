import type { FeatureEntitlementDTO, FeatureKey } from '@booking/types';

/** Whether the plan's feature list unlocks `feature`. Fails closed on missing data. */
export function hasFeature(
  features: readonly FeatureEntitlementDTO[] | undefined,
  feature: FeatureKey,
): boolean {
  return features?.some((f) => f.feature === feature) ?? false;
}

/** Monthly cap for a feature: null when uncapped, not in the plan, or unknown. */
export function monthlyLimit(
  features: readonly FeatureEntitlementDTO[] | undefined,
  feature: FeatureKey,
): number | null {
  return features?.find((f) => f.feature === feature)?.monthly_limit ?? null;
}
