import type { FeatureKey, PlanKey } from '@booking/types';
import * as React from 'react';

import { useMe } from '@/features/business/me';

import { hasFeature, monthlyLimit } from './logic';

export interface Entitlements {
  /** null until the session is loaded or if loading failed */
  plan: PlanKey | null;
  /** Fails closed: false while loading or on error */
  has: (feature: FeatureKey) => boolean;
  limitOf: (feature: FeatureKey) => number | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * What the business's plan unlocks, from `GET /v1/me` (the API is the
 * authority; it reads plan_features). Gate UI on a feature, never a plan name.
 */
export function useEntitlements(): Entitlements {
  const me = useMe();
  const features = me.data?.features;
  return React.useMemo(
    () => ({
      plan: me.data?.plan ?? null,
      has: (feature) => hasFeature(features, feature),
      limitOf: (feature) => monthlyLimit(features, feature),
      isLoading: me.isPending,
      isError: me.isError,
    }),
    [me.data?.plan, features, me.isPending, me.isError],
  );
}
