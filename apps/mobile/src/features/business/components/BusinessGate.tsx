import * as React from 'react';

import { ErrorState, LoadingCard } from '@/components/States';

import { useBusiness, type BusinessSummary } from '../hooks';

/** Renders children once the caller's business (timezone, currency) is loaded. */
export function BusinessGate({
  children,
}: {
  children: (business: BusinessSummary) => React.ReactNode;
}) {
  const business = useBusiness();
  if (business.isPending) return <LoadingCard />;
  if (business.isError) {
    return (
      <ErrorState
        error={business.error}
        onRetry={() => void business.refetch()}
      />
    );
  }
  return <>{children(business.data)}</>;
}
