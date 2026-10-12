import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Header } from '@/components/Header';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingCard } from '@/components/States';
import { useBusinessDetails } from '@/features/business/hooks';

import { BusinessDetailsForm } from './BusinessDetailsForm';

export function BusinessDetailsScreen() {
  const { t } = useTranslation();
  const details = useBusinessDetails();
  if (details.data) return <BusinessDetailsForm initial={details.data} />;
  return (
    <Screen
      header={
        <Header title={t('businessDetails.title')} fallbackHref="/settings" />
      }
    >
      {details.isError ? (
        <ErrorState
          error={details.error}
          onRetry={() => void details.refetch()}
        />
      ) : (
        <LoadingCard />
      )}
    </Screen>
  );
}
