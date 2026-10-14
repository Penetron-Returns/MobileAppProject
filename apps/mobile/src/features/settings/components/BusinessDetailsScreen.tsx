import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Page } from '@/components/Page';
import { ErrorScreen } from '@/components/states/ErrorScreen';
import { ListSkeleton } from '@/components/states/ListSkeleton';
import { useBusinessDetails } from '@/features/business/hooks';

import { BusinessDetailsForm } from './BusinessDetailsForm';

export function BusinessDetailsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const details = useBusinessDetails();
  if (details.data) return <BusinessDetailsForm initial={details.data} />;
  return (
    <Page
      title={t('businessDetails.title')}
      backLabel={t('tabs.settings')}
      backFallback="/settings"
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {details.isError ? (
        <ErrorScreen
          error={details.error}
          onRetry={() => void details.refetch()}
        />
      ) : (
        <ListSkeleton rows={4} />
      )}
    </Page>
  );
}
