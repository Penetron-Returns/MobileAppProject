import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { ErrorState, LoadingCard, LoadingRows } from '@/components/States';
import { TabHeader } from '@/components/TabHeader';
import { Text } from '@/components/ui/text';
import { useBusiness, type BusinessSummary } from '@/features/business/hooks';
import { setCalendarViewMode } from '@/features/calendar/navigation';
import { todayISO } from '@/lib/time';

import { useDashboardSummary, useDaySchedule } from '../hooks';
import { NextAppointmentCard } from './NextAppointmentCard';
import { RevenueCard, TodayBookingsCard } from './StatCards';
import { TodaySchedule } from './TodaySchedule';

export function DashboardScreen() {
  const business = useBusiness();
  const queryClient = useQueryClient();
  return (
    <Screen
      header={<TabHeader />}
      onRefresh={() => queryClient.refetchQueries({ type: 'active' })}
    >
      {business.isPending ? (
        <LoadingCard />
      ) : business.isError ? (
        <ErrorState
          error={business.error}
          onRetry={() => void business.refetch()}
        />
      ) : (
        <DashboardContent business={business.data} />
      )}
    </Screen>
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
    <>
      <View className="gap-4">
        {summary.isPending ? (
          <LoadingCard />
        ) : summary.isError ? (
          <ErrorState
            error={summary.error}
            onRetry={() => void summary.refetch()}
          />
        ) : (
          <View className="gap-4 md:flex-row">
            <RevenueCard summary={summary.data} currency={business.currency} />
            <TodayBookingsCard today={summary.data.today} />
          </View>
        )}
        {summary.isSuccess && schedule.isSuccess ? (
          <NextAppointmentCard
            appointment={next}
            timezone={business.timezone}
          />
        ) : null}
      </View>

      <View className="mt-4">
        <View className="mb-3 flex-row items-end justify-between">
          <Text className="text-foreground text-lg font-bold">
            {t('dashboard.todaysSchedule')}
          </Text>
          <Pressable
            onPress={() => {
              setCalendarViewMode('day');
              router.push({
                pathname: '/calendar',
                params: { view: 'day', t: String(Date.now()) },
              } as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.viewAllLabel')}
            hitSlop={8}
          >
            <Text className="text-primary text-xs font-bold uppercase tracking-wider">
              {t('dashboard.viewAll')}
            </Text>
          </Pressable>
        </View>
        {schedule.isPending ? (
          <LoadingRows count={3} />
        ) : schedule.isError ? (
          <ErrorState
            error={schedule.error}
            onRetry={() => void schedule.refetch()}
          />
        ) : (
          <TodaySchedule
            appointments={schedule.data}
            nextId={nextId}
            timezone={business.timezone}
          />
        )}
      </View>
    </>
  );
}
