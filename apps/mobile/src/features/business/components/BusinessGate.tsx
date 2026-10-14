import { ErrorState, LoadingCard } from '@booking/ui';
import * as React from 'react';

import { describeError } from '@/lib/toast';

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
        variant="banner"
        {...describeError(business.error)}
        onRetry={() => void business.refetch()}
      />
    );
  }
  return <>{children(business.data)}</>;
}
