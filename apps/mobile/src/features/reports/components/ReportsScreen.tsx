import {
  AnimatedNumber,
  ErrorState,
  Page,
  Pressable,
  Reveal,
  SegmentedControl,
  Skeleton,
  Surface,
  Text,
  useDepth,
} from '@booking/ui';
import { ArrowDown, ArrowUp, Download } from 'lucide-react-native';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Share, View } from 'react-native';

import { SavedCopyBanner } from '@/components/SavedCopyBanner';
import { BusinessGate } from '@/features/business/components/BusinessGate';
import { formatMoney } from '@/lib/format';
import { isFailed, loadError } from '@/lib/offline';
import { describeError } from '@/lib/toast';

import type { ReportData } from '../aggregate';
import { revenueCsv } from '../csv';
import { useReport } from '../hooks';
import {
  periodLabelParts,
  previousLabelParts,
  REPORT_RANGES,
  type ReportPeriod,
  type ReportRange,
} from '../period';
import { ReportSections } from './ReportSections';
import { RevenueChart } from './RevenueChart';

/** Reports: revenue, bookings and where they come from, from the business's own appointments. */
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
  const [range, setRange] = React.useState<ReportRange>('month');
  const { query, period, today } = useReport(range, timezone);
  return (
    <>
      <SegmentedControl
        value={range}
        onChange={setRange}
        label={t('reports.range.label')}
        options={REPORT_RANGES.map((value) => ({
          value,
          label: t(`reports.range.${value}`),
        }))}
        className="mx-4"
      />
      <SavedCopyBanner query={query} timezone={timezone} />
      {isFailed(query) ? (
        <ErrorState
          variant="banner"
          title={t('reports.error.title')}
          description={t('reports.error.description')}
          {...describeError(loadError(query))}
          onRetry={() => void query.refetch()}
        />
      ) : query.data ? (
        <ReportContent
          report={query.data}
          period={period}
          today={today}
          currency={currency}
        />
      ) : (
        <ReportsSkeleton />
      )}
    </>
  );
}

function Delta({ percent, period }: { percent: number; period: ReportPeriod }) {
  const { t } = useTranslation();
  const depth = useDepth();
  const prev = previousLabelParts(period);
  const versus = t(`reports.versus.${prev.kind}`, { label: prev.label });
  const color =
    percent > 0
      ? depth.colors.green
      : percent < 0
        ? depth.colors.destructiveText
        : depth.colors.secondary;
  const Arrow = percent < 0 ? ArrowDown : ArrowUp;
  const text =
    percent === 0
      ? t('reports.delta.flat', { versus })
      : t(percent > 0 ? 'reports.delta.up' : 'reports.delta.down', {
          percent: Math.abs(percent),
          versus,
        });
  return (
    <View className="flex-row items-center gap-1">
      {percent === 0 ? null : (
        <Arrow size={15} strokeWidth={2.6} color={color} />
      )}
      <Text style={{ color }} className="text-subtitle font-semibold">
        {text}
      </Text>
    </View>
  );
}

function KpiCard({ report }: { report: ReportData }) {
  const { t } = useTranslation();
  const none = t('reports.kpi.none');
  const kpis = [
    { key: 'bookings', value: report.bookings.toLocaleString('en-US') },
    {
      key: 'noShowRate',
      value: report.noShowPercent === null ? none : `${report.noShowPercent}%`,
    },
    {
      key: 'returning',
      value:
        report.returningPercent === null ? none : `${report.returningPercent}%`,
    },
  ];
  return (
    <Surface variant="raised" radius={22} className="mx-5 mt-5 flex-row p-4">
      {kpis.map(({ key, value }) => (
        <View
          key={key}
          accessible
          accessibilityLabel={`${t(`reports.kpi.${key}`)}: ${value}`}
          className="min-w-0 flex-1"
        >
          <Text
            numberOfLines={1}
            className="text-subtitle text-muted-foreground"
          >
            {t(`reports.kpi.${key}`)}
          </Text>
          <Text
            style={{ fontVariant: ['tabular-nums'] }}
            className="text-[28px] font-bold leading-[34px]"
          >
            {value}
          </Text>
        </View>
      ))}
    </Surface>
  );
}

function ExportRow({
  report,
  period,
  currency,
}: {
  report: ReportData;
  period: ReportPeriod;
  currency: string;
}) {
  const { t } = useTranslation();
  const depth = useDepth();
  const unit = t(
    period.granularity === 'month'
      ? 'reports.chart.unitMonth'
      : 'reports.chart.unitDay',
  );
  return (
    <Pressable
      onPress={() =>
        void Share.share({
          title: t('reports.export.title', { unit }),
          message: revenueCsv(report.bars, currency),
        })
      }
      accessibilityRole="button"
      accessibilityLabel={t('reports.export.action')}
      className="min-h-14 flex-row items-center gap-1.5 px-4"
    >
      <Download size={20} strokeWidth={1.8} color={depth.colors.tint} />
      <Text style={{ color: depth.colors.tint }} className="text-title">
        {t('reports.export.action')}
      </Text>
    </Pressable>
  );
}

function ReportContent({
  report,
  period,
  today,
  currency,
}: {
  report: ReportData;
  period: ReportPeriod;
  today: string;
  currency: string;
}) {
  const { t } = useTranslation();
  const label = periodLabelParts(period, today);
  const hasRevenue = report.bars.some((b) => b.cents > 0);
  return (
    <>
      <Reveal scope="reports" index={0}>
        <View className="mx-5 mt-6">
          <Text className="text-subtitle font-semibold text-muted-foreground">
            {t('reports.revenue', {
              period: label.from ? t('reports.period', label) : label.to,
            })}
          </Text>
          <AnimatedNumber
            value={report.revenueCents}
            format={(cents) =>
              formatMoney(cents, currency, { decimals: false })
            }
            className="mt-0.5 text-large-title font-bold"
          />
          {report.deltaPercent === null ? null : (
            <Delta percent={report.deltaPercent} period={period} />
          )}
          <RevenueChart
            bars={report.bars}
            range={period.range}
            currency={currency}
            today={today}
          />
          {hasRevenue ? null : (
            <Text className="mt-1 text-subtitle text-muted-foreground">
              {t('reports.chart.empty')}
            </Text>
          )}
        </View>
      </Reveal>
      <Reveal scope="reports" index={1}>
        <KpiCard report={report} />
      </Reveal>
      <Reveal scope="reports" index={2}>
        <ReportSections
          staff={report.staff}
          sources={report.sources}
          heat={report.heat}
          currency={currency}
          footer={
            <ExportRow report={report} period={period} currency={currency} />
          }
        />
      </Reveal>
    </>
  );
}

/** Placeholder shaped like the hero, the chart and the cards while the report loads. */
export function ReportsSkeleton() {
  const { t } = useTranslation();
  return (
    <View
      accessibilityLabel={t('reports.loading')}
      accessibilityState={{ busy: true }}
    >
      <View className="mx-5 mt-6 gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="mt-3 h-[168px] w-full" />
      </View>
      <Surface variant="raised" radius={22} className="mx-5 mt-5 gap-3 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-3/4" />
      </Surface>
    </View>
  );
}
