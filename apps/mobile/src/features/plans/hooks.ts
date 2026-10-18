import type { FeatureKey, PlanKey } from '@booking/types';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { useMe } from '@/features/business/me';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

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

/** Plans and prices for the Plan page, in catalogue order. */
export function usePlans() {
  // The catalogue changes with a release, not a session: keep it for 10 minutes.
  return useQuery({
    queryKey: qk.plans,
    queryFn: api.plans,
    staleTime: 10 * 60_000,
  });
}

/** Completed jobs against the allowance; the current month when `month` is omitted. */
export function useBillingUsage(month?: string) {
  return useQuery({
    queryKey: qk.billingUsage(month ?? null),
    queryFn: () => api.billingUsage(month),
  });
}
