import type { FeatureKey } from '@shared/api';
import * as React from 'react';

import { useEntitlements } from '../hooks';

interface GateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  /** Shown when the plan lacks the feature, or entitlements failed to load. Default: nothing. */
  fallback?: React.ReactNode;
  /** Shown while entitlements load. Default: nothing (never flashes gated UI). */
  loading?: React.ReactNode;
}

/** Renders `children` only when the business's plan includes `feature`. */
export function Gate({
  feature,
  children,
  fallback = null,
  loading = null,
}: GateProps) {
  const entitlements = useEntitlements();
  if (entitlements.isLoading) return <>{loading}</>;
  return <>{entitlements.has(feature) ? children : fallback}</>;
}
