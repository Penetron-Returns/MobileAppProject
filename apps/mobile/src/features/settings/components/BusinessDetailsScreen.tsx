import { ErrorState, ListSkeleton } from '@booking/ui';

import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';
import { useBusinessDetails } from '@/features/business/hooks';

import { BusinessDetailsForm } from './BusinessDetailsForm';

export function BusinessDetailsScreen() {
  const details = useBusinessDetails();
  return (
    <BusinessDetailsForm
      initial={details.data}
      fallback={
        isFailed(details) ? (
          <ErrorState
            variant="banner"
            {...describeError(loadError(details))}
            onRetry={() => void details.refetch()}
          />
        ) : (
          <ListSkeleton rows={4} />
        )
      }
    />
  );
}
