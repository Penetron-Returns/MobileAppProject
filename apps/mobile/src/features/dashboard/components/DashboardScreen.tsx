import { ErrorState, LoadingCard, Page, Text, TintLink } from '@booking/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BusinessGate } from '@/features/business/components/BusinessGate';
import type { BusinessSummary } from '@/features/business/hooks';
import { setCalendarViewMode } from '@/features/calendar/navigation';
import { isFailed, loadError } from '@/lib/offline';
import { todayISO } from '@/lib/time';
import { describeError } from '@/lib/toast';

import { useDashboardSummary, useDaySchedule } from '../hooks';
import { NextAppointmentCard } from './NextAppointmentCard';
import { RevenueCard, TodayBookingsCard } from './StatCards';
import { TodaySchedule } from './TodaySchedule';

/** Dashboard: monthly revenue, today's bookings, the next appointment and today's schedule. */
export function DashboardScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (
    <Page
      title={t('tabs.dashboard')}
      isTab
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      <BusinessGate>
        {(business) => <DashboardContent business={business} />}
      </BusinessGate>
    </Page>
  );
}

function DashboardContent({ business }: { business: BusinessSummary }) {
  const { t } = useTranslation();
  const today = todayISO(business.timezone);
  const summary = useDashboardSummary(today);
  const schedule = useDaySchedule(today, business.timezone);
  const nextId = summary.data?.next_appointment_id ?? null;
  const next = schedule.data?.find((a) => a.id === nextId) ?? null;

  return (
    <View className="mx-5 mt-4 gap-4">
      {isFailed(summary) ? (
        <ErrorState
          variant="banner"
          {...describeError(loadError(summary))}
          onRetry={() => void summary.refetch()}
        />
      ) : summary.data ? (
        <View className="flex-row gap-4">
          <RevenueCard summary={summary.data} currency={business.currency} />
          <TodayBookingsCard today={summary.data.today} />
        </View>
      ) : (
        <LoadingCard />
      )}
      {summary.isSuccess && schedule.isSuccess ? (
        <NextAppointmentCard appointment={next} timezone={business.timezone} />
      ) : null}

      <View>
        <View className="mb-3 flex-row items-end justify-between">
          <Text className="text-title font-bold">
            {t('dashboard.todaysSchedule')}
          </Text>
          <TintLink
            label={t('dashboard.viewAll')}
            onPress={() => {
              setCalendarViewMode('day');
              router.push({
                pathname: '/calendar',
                params: { view: 'day', t: String(Date.now()) },
              } as never);
            }}
          />
        </View>
        {isFailed(schedule) ? (
          <ErrorState
            variant="banner"
            {...describeError(loadError(schedule))}
            onRetry={() => void schedule.refetch()}
          />
        ) : schedule.data ? (
          <TodaySchedule
            appointments={schedule.data}
            nextId={nextId}
            timezone={business.timezone}
          />
        ) : (
          <LoadingCard />
        )}
      </View>
    </View>
  );
}
