import type { ReportsSummaryDTO } from '@booking/types';
import {
  AnimatedNumber,
  ErrorState,
  Page,
  Reveal,
  Skeleton,
  Surface,
  Text,
} from '@booking/ui';
import { router } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import { useCanManage } from '@/features/business/me';
import { UsageCard } from '@/features/plans/components/UsageCard';
import { formatMoney } from '@/lib/format';
import { isFailed, loadError } from '@/lib/offline';
import { todayISO } from '@/lib/time';
import { describeError } from '@/lib/toast';

import { useReportsSummary } from '../hooks';
import { canGoNext, monthLabel, monthOf, shiftMonth } from '../logic';
import { CompanionCard, SourcesCard, StatsCard } from './ReportCards';
import { MonthSwitcher } from './MonthSwitcher';
import { WeeklyChart } from './WeeklyChart';

/** Reports: a month at a glance for paid plans, from `GET /v1/reports/summary`. */
export function ReportsScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t('reports.title')} isTab>
      <BusinessGate>
        {(business) => (
          <ReportsBody
            timezone={business.timezone}
            currency={business.currency}
          />
        )}
      </BusinessGate>
    </Page>
  );
}

function ReportsBody({
  timezone,
  currency,
}: {
  timezone: string;
  currency: string;
}) {
  const { t } = useTranslation();
  const today = todayISO(timezone);
  const currentMonth = monthOf(today);
  const [month, setMonth] = React.useState(currentMonth);
  const report = useReportsSummary(month);

  return (
    <>
      <MonthSwitcher
        month={month}
        currentMonth={currentMonth}
        canNext={canGoNext(month, currentMonth)}
        onPrev={() => setMonth((m) => shiftMonth(m, -1))}
        onNext={() => setMonth((m) => shiftMonth(m, 1))}
        onPick={setMonth}
      />
      <SavedCopyBanner query={report} timezone={timezone} />
      {isFailed(report) ? (
        <ErrorState
          variant="banner"
          title={t('reports.error.title')}
          description={t('reports.error.description')}
          {...describeError(loadError(report))}
          onRetry={() => void report.refetch()}
        />
      ) : report.data ? (
        <ReportContent
          report={report.data}
          today={today}
          fallbackCurrency={currency}
        />
      ) : (
        <ReportsSkeleton />
      )}
    </>
  );
}

function ReportContent({
  report,
  today,
  fallbackCurrency,
}: {
  report: ReportsSummaryDTO;
  today: string;
  fallbackCurrency: string;
}) {
  const { t } = useTranslation();
  const canManage = useCanManage();
  const currency = report.currency || fallbackCurrency;
  return (
    <>
      <Reveal scope="reports" index={0}>
        <View className="mx-5 mt-5">
          <Text className="text-subtitle font-semibold text-muted-foreground">
            {t('reports.revenue', { month: monthLabel(report.month) })}
          </Text>
          <AnimatedNumber
            value={report.revenue_cents}
            format={(cents) =>
              formatMoney(cents, currency, { decimals: false })
            }
            className="mt-0.5 text-large-title font-bold"
          />
          <AnimatedNumber
            value={report.completed_jobs}
            format={(count) => t('reports.completedJobs', { count })}
            className="text-title"
          />
          <WeeklyChart weekly={report.weekly} today={today} />
        </View>
      </Reveal>
      <Reveal scope="reports" index={1}>
        <CompanionCard outcomes={report.companion} />
      </Reveal>
      <Reveal scope="reports" index={2}>
        <SourcesCard by={report.bookings_created} />
      </Reveal>
      <Reveal scope="reports" index={3}>
        <StatsCard
          noShows={report.no_shows}
          cancellations={report.cancellations}
          busiest={report.busiest}
        />
      </Reveal>
      <Reveal scope="reports" index={4}>
        <UsageCard
          usage={report.usage}
          planName={t(`plans.names.${report.usage.plan}`)}
          onPress={
            canManage ? () => router.push('/settings/plan' as never) : undefined
          }
        />
      </Reveal>
    </>
  );
}

/** Placeholder shaped like the hero, the chart and the cards while the month loads. */
export function ReportsSkeleton() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('reports.loading')}
      accessibilityState={{ busy: true }}
    >
      <View className="mx-5 mt-5 gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="mt-3 h-[120px] w-full" />
      </View>
      <Surface variant="raised" radius={22} className="mx-5 mt-7 gap-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </Surface>
    </View>
  );
}
