/** Plan entitlement port. */
import type { EntitlementsDTO, FeatureKey, UUID } from '@booking/types';

/** Resolves what a business's plan unlocks. Always a live read: plans can change at any time. */
export interface EntitlementService {
  getEntitlements(businessId: UUID): Promise<EntitlementsDTO>;
  hasFeature(businessId: UUID, feature: FeatureKey): Promise<boolean>;
  /** Businesses whose plan unlocks `feature`, ordered by id, strictly after `after` */
  listBusinessIdsWithFeature(feature: FeatureKey, opts: { after?: UUID; limit: number }): Promise<UUID[]>;
}
