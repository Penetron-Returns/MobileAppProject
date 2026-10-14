import { IconButton, OfflineBanner, Page, Surface, Text } from '@booking/ui';
import { Bell } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formatMoney } from '@/lib/format';
import { savedCopyLabel } from '@/lib/offline';
import { toast } from '@/lib/toast';

import { useToday, type TodayView } from '../hooks';
import { LaterToday } from './LaterToday';
import {
  TodayAllDone,
  TodayEmpty,
  TodayError,
  TodaySkeleton,
} from './TodayStates';
import { UpNextCard } from './UpNextCard';

/** Today: what is next, what is later, and what the day is worth. */
export function TodayScreen() {
  const { t } = useTranslation();
  const view = useToday();
  return (
    <Page
      title={t('today.title')}
      caption={view.status === 'ready' ? (view.caption ?? ' ') : ' '}
      isTab
      onRefresh={view.status === 'ready' ? view.refresh : undefined}
      titleRight={
        <IconButton
          icon={Bell}
          label={t('today.notifications')}
          size="sm"
          tone="label"
          onPress={() => toast.info(t('today.noNotifications'))}
        />
      }
    >
      <TodayBody view={view} />
    </Page>
  );
}

function TodayBody({ view }: { view: TodayView }) {
  const { t } = useTranslation();
  if (view.status === 'loading') return <TodaySkeleton />;
  if (view.status === 'error') {
    return <TodayError error={view.error} onRetry={view.retry} />;
  }
  return (
    <>
      {view.isOffline ? (
        <OfflineBanner label={savedCopyLabel(t, view.lastUpdated)} />
      ) : null}
      {view.appointments.length === 0 ? (
        <TodayEmpty />
      ) : view.upNext ? (
        <>
          <UpNextCard
            appointment={view.upNext}
            now={view.now}
            timezone={view.timezone}
          />
          <LaterToday later={view.later} timezone={view.timezone} />
        </>
      ) : (
        <TodayAllDone />
      )}
      {view.appointments.length > 0 ? (
        <TodaySummary
          expectedCents={view.expectedCents}
          currency={view.currency}
        />
      ) : null}
    </>
  );
}

/** One quiet line under the list: what today is expected to bring in. */
function TodaySummary({
  expectedCents,
  currency,
}: {
  expectedCents: number;
  currency: string;
}) {
  const { t } = useTranslation();
  return (
    <View className="mx-5 mt-5">
      <Surface variant="engrave" className="h-0.5" />
      <Text className="pt-3.5 text-subtitle text-muted-foreground">
        {t('today.expected', {
          amount: formatMoney(expectedCents, currency, { decimals: false }),
        })}
      </Text>
    </View>
  );
}
